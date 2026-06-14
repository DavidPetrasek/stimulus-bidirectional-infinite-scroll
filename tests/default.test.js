import { Application } from '@hotwired/stimulus';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isScrollableY } from '@dpsys/js-utils/el';
import BidirectionalInfiniteScroll from '../src/index';

// --- Mocks for Global Browser APIs ---
let activeObserverInstance = null;

class MockIntersectionObserver {
  constructor(callback, options = {}) {
    this.callback = callback;
    this.root = options.root || null;
    this.rootMargin = options.rootMargin || '';
    this.thresholds = [];
    this.observedElements = new Set();
    activeObserverInstance = this;
  }

  observe(target) {
    this.observedElements.add(target);
  }

  unobserve(target) {
    this.observedElements.delete(target);
  }

  disconnect() {
    this.observedElements.clear();
  }

  takeRecords() {
    return [];
  }

  // Test helper to programmatically trigger intersection events
  simulateIntersection(isIntersecting, targetElement) {
    const entry = {
      isIntersecting,
      target: targetElement,
    };
    this.callback([entry], this);
  }
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// Mock @dpsys/js-utils behavior inside jsdom environment
vi.mock('@dpsys/js-utils/misc', () => ({
  emToPx: (em) => em * 16,
}));

vi.mock('@dpsys/js-utils/el', () => ({
  htmlToElements: (html) => {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return Array.from(template.content.childNodes);
  },
  isScrollableX: vi.fn(() => true),
  isScrollableY: vi.fn(() => true),
}));

// --- Concrete subclass for testing implementation rules ---
class ConcreteInfiniteScrollController extends BidirectionalInfiniteScroll {
  mockResponseHTML = '<div>Item Alpha</div><div>Item Beta</div>';
  lastReceivedFormData = null;

  async loadMoreCallback(formData) {
    this.lastReceivedFormData = formData;
    return this.mockResponseHTML;
  }
}

// --- Test Suite ---
describe('BidirectionalInfiniteScroll Controller', () => {
  let application;
  let container;

  beforeEach(() => {
    application = Application.start();
    container = document.createElement('div');
    document.body.appendChild(container);
    activeObserverInstance = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    application.stop();
    container.remove();
  });

  it('throws an abstract implementation error if loadMoreCallback is called directly on the base class', async () => {
    application.register('base-scroll', BidirectionalInfiniteScroll);
    container.innerHTML = `
      <div data-controller="base-scroll" data-base-scroll-nb-pages-value="5">
        <div>First Item</div>
      </div>
    `;

    const element = container.firstElementChild;
    
    // Wait for Stimulus asynchronous registration cycle to complete
    await vi.waitFor(() => {
      const controller = application.getControllerForElementAndIdentifier(element, 'base-scroll');
      expect(controller).not.toBeNull();
    });

    const controller = application.getControllerForElementAndIdentifier(element, 'base-scroll');
    await expect(controller.loadMoreCallback(new FormData())).rejects.toThrowError(
      "[Stimulus Bidirectional Infinite Scroll] 'loadMoreCallback' must be implemented by a subclass."
    );
  });

  it('correctly initializes values, triggers observer tracking setup, and hooks container by default', async () => {
    application.register('infinite-scroll', ConcreteInfiniteScrollController);
    container.innerHTML = `
      <div data-controller="infinite-scroll" 
           data-infinite-scroll-nb-pages-value="10"
           data-infinite-scroll-curr-page-value="2"
           data-infinite-scroll-trigger-distance-em-value="5"
           data-infinite-scroll-load-more-direction-value="down">
        <p>Item 1</p>
        <p id="target-trigger">Item 2</p>
      </div>
    `;

    const element = container.firstElementChild;
    
    await vi.waitFor(() => expect(activeObserverInstance).not.toBeNull());

    expect(activeObserverInstance.root).toBe(element);
    expect(activeObserverInstance.rootMargin).toBe('0px 0px 80px 0px'); // 5em * 16px = 80px
    expect(activeObserverInstance.observedElements.has(document.getElementById('target-trigger'))).toBe(true);
  });

  it('honors customScrollContainerValue configurations and stays dormant until explicitly enabled', async () => {
    application.register('infinite-scroll', ConcreteInfiniteScrollController);
    container.innerHTML = `
      <div id="wrapper" data-controller="infinite-scroll" 
           data-infinite-scroll-nb-pages-value="10"
           data-infinite-scroll-custom-scroll-container-value="true">
        <div id="nested-scroll-viewport">
          <p id="item">Item</p>
        </div>
      </div>
    `;

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(activeObserverInstance).toBeNull(); 

    const controllerEl = document.getElementById('wrapper');
    const viewportEl = document.getElementById('nested-scroll-viewport');
    
    await vi.waitFor(() => {
      const controller = application.getControllerForElementAndIdentifier(controllerEl, 'infinite-scroll');
      expect(controller).not.toBeNull();
    });

    const controller = application.getControllerForElementAndIdentifier(controllerEl, 'infinite-scroll');
    controller.setScrollContainer(viewportEl);
    expect(controller.getScrollContainer()).toBe(viewportEl);

    await controller.enable();
    expect(activeObserverInstance).not.toBeNull();
    expect(activeObserverInstance.root).toBe(viewportEl);
  });

  it('advances forward pages and appends payload correctly during down scroll intersections', async () => {
    application.register('infinite-scroll', ConcreteInfiniteScrollController);
    container.innerHTML = `
      <div data-controller="infinite-scroll" 
           data-infinite-scroll-nb-pages-value="3" 
           data-infinite-scroll-curr-page-value="1">
        <div id="initial-item">Initial Node</div>
      </div>
    `;

    const element = container.firstElementChild;
    let eventDetail = null;
    element.addEventListener('infinite-scroll:elements-added', (e) => {
      eventDetail = e.detail;
    });

    await vi.waitFor(() => expect(activeObserverInstance).not.toBeNull());
    const initialTrigger = document.getElementById('initial-item');

    await activeObserverInstance.simulateIntersection(true, initialTrigger);

    expect(element.children.length).toBe(3); 
    expect(element.lastElementChild.textContent).toBe('Item Beta');
    
    const controller = application.getControllerForElementAndIdentifier(element, 'infinite-scroll');
    expect(controller.currPageValue).toBe(2);
    expect(controller.lastReceivedFormData.get('page')).toBe('2');

    expect(eventDetail).not.toBeNull();
    expect(eventDetail.newElems.length).toBe(2);
  });

  it('decrements pages and prepends payload while securely mitigating visual UI layout jumps during up scroll intersections', async () => {
    application.register('infinite-scroll', ConcreteInfiniteScrollController);
    container.innerHTML = `
      <div data-controller="infinite-scroll" 
           data-infinite-scroll-nb-pages-value="5" 
           data-infinite-scroll-curr-page-value="3"
           data-infinite-scroll-load-more-direction-value="up">
        <div id="top-item">Top Node</div>
      </div>
    `;

    const element = container.firstElementChild;
    
    // Add configurable: true so vi.spyOn can overwrite these properties later
    Object.defineProperty(element, 'scrollTop', { writable: true, value: 50, configurable: true });
    Object.defineProperty(element, 'scrollHeight', { writable: true, value: 500, configurable: true });

    await vi.waitFor(() => expect(activeObserverInstance).not.toBeNull());
    const initialTrigger = document.getElementById('top-item');

    vi.spyOn(element, 'scrollHeight', 'get').mockImplementationOnce(() => 500).mockImplementationOnce(() => 750);

    await activeObserverInstance.simulateIntersection(true, initialTrigger);

    const controller = application.getControllerForElementAndIdentifier(element, 'infinite-scroll');
    expect(controller.currPageValue).toBe(2);
    expect(element.firstElementChild.textContent).toBe('Item Alpha');

    // scrollTopBeforeInsert (50) + (scrollHeightAfterInsert (750) - scrollHeightBeforeInsert (500)) = 300
    expect(element.scrollTop).toBe(300);
  });

  it('halts network layout loops completely when boundary ceilings are reached', async () => {
    application.register('infinite-scroll', ConcreteInfiniteScrollController);
    container.innerHTML = `
      <div data-controller="infinite-scroll" 
           data-infinite-scroll-nb-pages-value="3" 
           data-infinite-scroll-curr-page-value="3">
        <div id="trigger">Bottom Node</div>
      </div>
    `;

    const element = container.firstElementChild;
    await vi.waitFor(() => expect(activeObserverInstance).not.toBeNull());

    const spy = vi.spyOn(ConcreteInfiniteScrollController.prototype, 'loadMoreCallback');
    await activeObserverInstance.simulateIntersection(true, document.getElementById('trigger'));

    expect(spy).not.toHaveBeenCalled();
  });

  it('validates type safety constraints on operational baseline utility APIs', async () => {
    application.register('infinite-scroll', ConcreteInfiniteScrollController);
    container.innerHTML = `<div id="el" data-controller="infinite-scroll" data-infinite-scroll-nb-pages-value="2"></div>`;
    
    const element = container.firstElementChild;
    await vi.waitFor(() => expect(activeObserverInstance).not.toBeNull());
    const controller = application.getControllerForElementAndIdentifier(element, 'infinite-scroll');

    expect(() => controller.setBaseFormData({})).toThrowError(
      '[Stimulus Bidirectional Infinite Scroll] Passed data is not an instance of FormData'
    );
    expect(() => controller.setScrollContainer({})).toThrowError(
      '[Stimulus Bidirectional Infinite Scroll] Passed data is not an instance of HTMLElement'
    );
  });

  it('runs autoFill loops sequentially until container boundaries are overflowing', async () => {
    vi.mocked(isScrollableY).mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);

    application.register('infinite-scroll', ConcreteInfiniteScrollController);
    container.innerHTML = `
      <div data-controller="infinite-scroll" 
           data-infinite-scroll-nb-pages-value="5" 
           data-infinite-scroll-curr-page-value="1"
           data-infinite-scroll-auto-fill-value="true">
        <div>Baseline Node</div>
      </div>
    `;

    const element = container.firstElementChild;

    // Put the controller retrieval inside the waitFor query
    await vi.waitFor(() => {
      const controller = application.getControllerForElementAndIdentifier(element, 'infinite-scroll');
      expect(controller).not.toBeNull();
      expect(controller.currPageValue).toBe(3);
    });
    
    expect(element.children.length).toBe(5); 
  });
});