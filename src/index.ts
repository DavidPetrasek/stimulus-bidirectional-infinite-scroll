import { Controller } from '@hotwired/stimulus';
import { emToPx } from '@dpsys/js-utils/misc';
import { htmlToElements, isScrollableX, isScrollableY } from '@dpsys/js-utils/el';

type State = 'disabled' | 'enabled';
type Direction = 'up' | 'down' | 'left' | 'right';

export default class extends Controller<HTMLElement> 
{
    #baseFormData: FormData = new FormData();
    #scrollCont: HTMLElement | null = null;
    #isLoadingMore: boolean = false;
    #state: State = 'disabled';
    
    // Observers
    #observer: IntersectionObserver | null = null;
    #observedElement: Element | null = null;
    #mutationObserver: MutationObserver | null = null;

    static override values = 
    {
        currPage: { type: Number, default: 1 },
        nbPages: Number,
        triggerDistanceEm: { type: Number, default: 10 },
        loadMoreDirection: { type: String, default: 'down' },
        customScrollContainer: { type: Boolean, default: false },
        autoFill: { type: Boolean, default: false },
        insertTargetQuerySelector: { type: String, default: null },
    };

    declare currPageValue: number;
    declare nbPagesValue: number;
    declare triggerDistanceEmValue: number;
    declare loadMoreDirectionValue: Direction;
    declare customScrollContainerValue: boolean;
    declare autoFillValue: boolean;
    declare insertTargetQuerySelectorValue: string | null;

    /**
     * Fallback base method meant to be overridden by child controller extensions.
     */
    protected async loadMoreCallback(formData: FormData): Promise<string> 
    {
        throw new Error(`[Stimulus Bidirectional Infinite Scroll] 'loadMoreCallback' must be implemented by a subclass.`);
    }

    override async connect() 
    {
        if (!this.customScrollContainerValue) 
        {
            this.#scrollCont = this.element;
            await this.enable();
        }
    }

    override disconnect() 
    {
        this.disable();
    }

    async enable() 
    {
        if (this.#state === 'enabled') return;
        this.#state = 'enabled';
        
        this.#setupObserver();

        if (this.autoFillValue) 
        {
            await this.autoFill();
        }
    }

    disable() 
    {
        if (this.#state === 'disabled') return;
        this.#state = 'disabled';
        this.#destroyObserver();
        this.#destroyMutationObserver();
    }

    #setupObserver() 
    {
        if (!this.#scrollCont) 
        {
            throw new Error('[Stimulus Bidirectional Infinite Scroll] Scroll container is not set');
        }

        this.#destroyObserver();

        const distancePx = emToPx(this.triggerDistanceEmValue);
        let rootMargin = `0px 0px 0px 0px`;

        // Configure precise margin boundaries depending on horizontal or vertical layout direction
        switch (this.loadMoreDirectionValue) 
        {
            case 'down':  rootMargin = `0px 0px ${distancePx}px 0px`; break;
            case 'up':    rootMargin = `${distancePx}px 0px 0px 0px`; break;
            case 'right': rootMargin = `0px ${distancePx}px 0px 0px`; break;
            case 'left':  rootMargin = `0px 0px 0px ${distancePx}px`; break;
        }

        this.#observer = new IntersectionObserver(this.#handleIntersection, 
        {
            root: this.#scrollCont,
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

    #setupMutationObserver(target: HTMLElement)
    {
        if (this.#mutationObserver) return;

        this.#mutationObserver = new MutationObserver(async () => 
        {
            // Ignore mutations caused natively by this library's append/prepend actions
            if (this.#isLoadingMore) return;

            // Automatically update the trigger element if:
            // 1. Container is no longer empty anymore 
            // 2. Entire container content was replaced via 'innerHTML' 
            const currentTrigger = this.#getTriggerElement(target);
            if (this.#observedElement !== currentTrigger)
            {
                this.#updateObservedElement();

                if (this.autoFillValue) 
                {
                    await this.autoFill();
                }
            }
        });

        this.#mutationObserver.observe(target, { childList: true });
    }

    #destroyMutationObserver()
    {
        if (this.#mutationObserver)
        {
            this.#mutationObserver.disconnect();
            this.#mutationObserver = null;
        }
    }

    #updateObservedElement() 
    {
        if (!this.#observer || !this.#scrollCont) return;

        if (this.#observedElement) 
        {
            this.#observer.unobserve(this.#observedElement);
            this.#observedElement = null;
        }

        const insertTarget = this.#getInsertTarget();
        if (!insertTarget) return;

        this.#setupMutationObserver(insertTarget);

        const triggerEl = this.#getTriggerElement(insertTarget);

        if (triggerEl)
        {
            this.#observedElement = triggerEl;
            this.#observer.observe(triggerEl);
        }
    }

    #getTriggerElement(insertTarget: HTMLElement): Element | null
    {
        const isForwardDirection = this.loadMoreDirectionValue === 'down' || this.loadMoreDirectionValue === 'right';
        return isForwardDirection ? insertTarget.lastElementChild : insertTarget.firstElementChild;
    }

    #getInsertTarget(): HTMLElement | null | undefined
    {
        return this.insertTargetQuerySelectorValue 
            ? this.#scrollCont?.querySelector(this.insertTargetQuerySelectorValue) 
            : this.#scrollCont;
    }

    #handleIntersection = async (entries: IntersectionObserverEntry[]) => 
    {
        const [entry] = entries;
        
        if (entry?.isIntersecting && !this.#isLoadingMore && !this.#isLastPage()) 
        {
            this.#isLoadingMore = true;
            try 
            {
                await this.#loadMore();
            }
            catch (error)
            {
                console.error('[Stimulus Bidirectional Infinite Scroll] Error executing callback:', error);
            }
            finally 
            {
                this.#isLoadingMore = false;
                this.#updateObservedElement();
            }
        }
    };

    async #loadMore()
    {
        const finalFormData = new FormData();
        for (const [key, value] of this.#baseFormData.entries())
        {
            finalFormData.append(key, value);
        }

        const isForwardDirection = this.loadMoreDirectionValue === 'down' || this.loadMoreDirectionValue === 'right';
        if (isForwardDirection) 
        {
            ++this.currPageValue;
        } 
        else 
        {
            --this.currPageValue;
        }

        finalFormData.append('page', this.currPageValue.toString(10));

        let scrollTopBeforeInsert = 0;
        let kontScrollHeightBeforeInsert = 0;
        let scrollLeftBeforeInsert = 0;
        let kontScrollWidthBeforeInsert = 0;

        // Cache positions for prepending directions to avoid jumpy UI layout adjustments
        if (this.#scrollCont) 
        {
            if (this.loadMoreDirectionValue === 'up') 
            {
                scrollTopBeforeInsert = this.#scrollCont.scrollTop;
                kontScrollHeightBeforeInsert = this.#scrollCont.scrollHeight;
            }
            else if (this.loadMoreDirectionValue === 'left')
            {
                scrollLeftBeforeInsert = this.#scrollCont.scrollLeft;
                kontScrollWidthBeforeInsert = this.#scrollCont.scrollWidth;
            }
        }

        const newHTML = await this.loadMoreCallback(finalFormData);
        const newElems = Array.from(htmlToElements(newHTML));
        
        const insertTarget = this.#getInsertTarget();
        if (!insertTarget) return;

        // Alignment insertion management
        if (this.loadMoreDirectionValue === 'up' && this.#scrollCont) 
        {
            insertTarget.prepend(...newElems);
            const kontScrollHeightAfterInsert = this.#scrollCont.scrollHeight;
            const newElemsHeight = kontScrollHeightAfterInsert - kontScrollHeightBeforeInsert;
            this.#scrollCont.scrollTop = scrollTopBeforeInsert + newElemsHeight;
        }
        else if (this.loadMoreDirectionValue === 'left' && this.#scrollCont)
        {
            insertTarget.prepend(...newElems);
            const kontScrollWidthAfterInsert = this.#scrollCont.scrollWidth;
            const newElemsWidth = kontScrollWidthAfterInsert - kontScrollWidthBeforeInsert;
            this.#scrollCont.scrollLeft = scrollLeftBeforeInsert + newElemsWidth;
        }
        else // Right or Down
        {
            insertTarget.append(...newElems);
        }

        this.dispatch('elements-added', { target: insertTarget, detail: { 'newElems': newElems } });
    }

    #isLastPage = (): boolean => 
    {
        const isForwardDirection = this.loadMoreDirectionValue === 'down' || this.loadMoreDirectionValue === 'right';
        return isForwardDirection 
            ? this.nbPagesValue === this.currPageValue 
            : this.currPageValue === 1;
    };

    #isScrollableContainer(): boolean
    {
        if (!this.#scrollCont) return false;

        if (this.loadMoreDirectionValue === 'up' || this.loadMoreDirectionValue === 'down')
        {
            return isScrollableY(this.#scrollCont);
        }
        
        if (this.loadMoreDirectionValue === 'left' || this.loadMoreDirectionValue === 'right')
        {
            return isScrollableX(this.#scrollCont);
        }

        return false;
    }

    setBaseFormData(formData: FormData)
    {
        if (!(formData instanceof FormData)) 
        {
            throw new Error('[Stimulus Bidirectional Infinite Scroll] Passed data is not an instance of FormData');
        }
        this.#baseFormData = formData;
    }

    setScrollContainer(scrollContainer: HTMLElement) 
    {
        if (!(scrollContainer instanceof HTMLElement)) 
        {
            throw new Error('[Stimulus Bidirectional Infinite Scroll] Passed data is not an instance of HTMLElement');
        }
        this.#scrollCont = scrollContainer;
    }

    getScrollContainer(): HTMLElement | null 
    {
        return this.#scrollCont;
    }

    async autoFill() 
    {
        while (!this.#isScrollableContainer() && !this.#isLastPage()) 
        {
            await this.#loadMore();
        }
        this.#updateObservedElement();
    }
}