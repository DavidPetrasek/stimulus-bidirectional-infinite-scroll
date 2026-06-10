import { Controller } from '@hotwired/stimulus';
import { emToPx } from '@dpsys/js-utils/misc';
import { isScrollableY } from '@dpsys/js-utils/el';

type State = 'disabled' | 'enabled';

interface LoadMoreCallbackResult 
{
    html: string;
}

export default class extends Controller<HTMLElement> 
{
    #baseFormData: FormData = new FormData();
    #scrollCont: HTMLElement | null = null;
    #isLoadingMore: boolean = false;
    #state: State = 'disabled';
    
    // Intersection Observer properties
    #observer: IntersectionObserver | null = null;
    #observedElement: Element | null = null;

    static override values = 
    {
        currPage: { type: Number, default: 1 },
        nbPages: Number,
        triggerDistanceEm: { type: Number, default: 22 },
        loadMoreDirection: { type: String, default: 'down' },
        customScrollContainer: { type: Boolean, default: false },
        autoFill: { type: Boolean, default: false },
        insertTargetQuerySelector: { type: String, default: null },
    };

    declare currPageValue: number;
    declare nbPagesValue: number;
    declare triggerDistanceEmValue: number;
    declare loadMoreDirectionValue: 'up' | 'down';
    declare customScrollContainerValue: boolean;
    declare autoFillValue: boolean;
    declare insertTargetQuerySelectorValue: string | null;

    /**
     * Fallback base method meant to be overriden by child controller extensions.
     */
    protected async loadMoreCallback(formData: FormData): Promise<LoadMoreCallbackResult> 
    {
        throw new Error(`[InfiniteScroll] 'loadMoreCallback' must be implemented by a subclass.`);
    }

    override async connect() 
    {
        if (!this.customScrollContainerValue) 
        {
            this.#scrollCont = this.element;
            if (this.autoFillValue) {await this.autoFill();}
            this.enable();
        }
    }

    override disconnect() 
    {
        this.disable();
    }

    enable() 
    {
        if (this.#state === 'enabled') return;
        this.#state = 'enabled';
        this.#setupObserver();
    }

    disable() 
    {
        if (this.#state === 'disabled') return;
        this.#state = 'disabled';
        this.#destroyObserver();
    }

    #setupObserver() 
    {
        if (!this.#scrollCont) return;

        this.#destroyObserver();

        // Convert target EM distance thresholds into precise pixels relative to current context styling
        const distancePx = emToPx(this.triggerDistanceEmValue);
        
        // Construct standard margins ensuring boundaries match up/down directions nicely
        const rootMargin = this.loadMoreDirectionValue === 'down' 
            ? `0px 0px ${distancePx}px 0px` 
            : `${distancePx}px 0px 0px 0px`;

        this.#observer = new IntersectionObserver(this.#handleIntersection, 
        {
            root: this.#scrollCont === this.element ? null : this.#scrollCont,
            rootMargin: rootMargin,
            threshold: 0,
        });

        this.#updateObservedElement();
    }

    #destroyObserver()
    {
        if (this.#observer) 
        {
            this.#observer.disconnect();
            this.#observer = null;
        }
        this.#observedElement = null;
    }

    #updateObservedElement() 
    {
        if (!this.#observer || !this.#scrollCont) return;

        // Clean previous observation hooks
        if (this.#observedElement) 
        {
            this.#observer.unobserve(this.#observedElement);
        }

        const insertTarget = this.insertTargetQuerySelectorValue 
            ? this.#scrollCont.querySelector(this.insertTargetQuerySelectorValue) 
            : this.#scrollCont;

        if (!insertTarget) return;

        // Monitor boundary nodes dynamically without requiring dummy wrapper wrappers
        const edgeChild = this.loadMoreDirectionValue === 'down'
            ? insertTarget.lastElementChild
            : insertTarget.firstElementChild;

        if (edgeChild) 
        {
            this.#observedElement = edgeChild;
            this.#observer.observe(edgeChild);
        }
    }

    #handleIntersection = async (entries: IntersectionObserverEntry[]) => 
    {
        const [entry] = entries;
        
        if (entry.isIntersecting && !this.#isLoadingMore && !this.#isLastPage()) 
        {
            this.#isLoadingMore = true;
            await this.#loadMore();
            this.#isLoadingMore = false;
            
            // Re-bind to the freshly appended/prepended boundary item
            this.#updateObservedElement();
        }
    };

    async #loadMore()
    {
        const finalFormData = new FormData();
        for (const [key, value] of this.#baseFormData.entries())
        {
            finalFormData.append(key, value);
        }

        if (this.loadMoreDirectionValue === 'down') 
        {
            ++this.currPageValue;
        } 
        else if (this.loadMoreDirectionValue === 'up') 
        {
            --this.currPageValue;
        }

        finalFormData.append('page', this.currPageValue.toString(10));

        let scrollTopBeforeInsert = 0;
        let kontScrollHeightBeforeInsert = 0;

        if (this.loadMoreDirectionValue === 'up' && this.#scrollCont) 
        {
            scrollTopBeforeInsert = this.#scrollCont.scrollTop;
            kontScrollHeightBeforeInsert = this.#scrollCont.scrollHeight;
        }

        const loadMoreCallbackRes = await this.loadMoreCallback(finalFormData);
        
        const insertTarget = this.insertTargetQuerySelectorValue 
            ? this.#scrollCont?.querySelector(this.insertTargetQuerySelectorValue) 
            : this.#scrollCont;

        if (!insertTarget) return;

        if (this.loadMoreDirectionValue === 'up' && this.#scrollCont) 
        {
            insertTarget.insertAdjacentHTML('afterbegin', loadMoreCallbackRes.html);

            const kontScrollHeightAfterInsert = this.#scrollCont.scrollHeight;
            const newElemsHeight = kontScrollHeightAfterInsert - kontScrollHeightBeforeInsert;
            this.#scrollCont.scrollTop = scrollTopBeforeInsert + newElemsHeight;
        }
        else if (this.loadMoreDirectionValue === 'down')
        {
            insertTarget.insertAdjacentHTML('beforeend', loadMoreCallbackRes.html);
        }
    }

    #isLastPage = (): boolean => 
    {
        return (this.loadMoreDirectionValue === 'down' && this.nbPagesValue === this.currPageValue) 
            || (this.loadMoreDirectionValue === 'up' && this.currPageValue === 1);
    };

    setBaseFormData(formData: FormData)
    {
        if (!(formData instanceof FormData)) 
        {
            throw new Error('[InfiniteScroll] Passed data is not an instance of FormData');
        }
        this.#baseFormData = formData;
    }

    setScrollContainer(scrollContainer: HTMLElement) 
    {
        if (!(scrollContainer instanceof HTMLElement)) 
        {
            throw new Error('[InfiniteScroll] Passed data is not an instance of HTMLElement');
        }
        this.#scrollCont = scrollContainer;
    }

    getScrollContainer(): HTMLElement | null 
    {        
        return this.#scrollCont;
    }

    async autoFill() 
    {
        while (!isScrollableY(this.#scrollCont as HTMLElement) && !this.#isLastPage()) 
        {
            await this.#loadMore();
        }
        this.#updateObservedElement();
    }
}