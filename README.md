[![NPM Downloads](https://img.shields.io/npm/dm/%40dpsys%2Fstimulus-bidirectional-infinite-scroll)](https://www.npmjs.com/package/@dpsys/stimulus-bidirectional-infinite-scroll)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](https://www.typescriptlang.org/)
[![ISC License](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

# Stimulus Bidirectional Infinite Scroll

Supports CJS and ESM.

## Features

- **Up/Down/Left/Right**
- **Triggerless**: Initial items or trigger element are not required
- **Auto fill**
- **Custom Scroll Viewports**: Seamless integration with third-party wrappers like `OverlayScrollbars`


## Installation
1. Run: 
``` bash
npm i @dpsys/stimulus-bidirectional-infinite-scroll
```
2. Register this controller in your bootstrap file:
``` js
import BidirectionalInfiniteScroll from "@dpsys/stimulus-bidirectional-infinite-scroll";
...
stimulusApp.register('bidirectional-infinite-scroll', BidirectionalInfiniteScroll);
```

## Example Usage
**1. Basic**
- This example uses Symfony UX StimulusBundle and the Fetch API. Use any other implementation of your choice.

``` js
// .../controllers/my-infinite-scroll-controller.js
import BidirectionalInfiniteController from '@dpsys/stimulus-bidirectional-infinite-scroll';

export default class extends BidirectionalInfiniteController 
{
    async loadMoreCallback(formData)
    {
        const response = await fetch("https://example.org/load-more", 
        {
            method: "POST",
            body: formData, // inherently contains the target 'page' parameter
        });
        return await response.text(); // Return raw HTML string containing elements
    }
}
```

``` twig
<div {{ stimulus_controller('my-infinite-scroll', {'loadMoreDirection': 'down', 'nbPages': 10, 'autoFill': true}) }} >
</div>
```

**2. Custom Containers (e.g., OverlayScrollbars)**
If your scroll layout runs inside a custom structural plugin wrapper rather than the controller element itself, flag `customScrollContainer` to handle initialization manually.

``` js
// .../controllers/my-infinite-scroll-controller.js
import BidirectionalInfiniteController from '@dpsys/stimulus-bidirectional-infinite-scroll';
import { OverlayScrollbars } from 'overlayscrollbars';

export default class extends BidirectionalInfiniteController 
{
    connect() 
    {
        super.connect();
        
        OverlayScrollbars(this.element, {},
        {
            initialized: (os) =>
            {
                // Point the controller to the actual overflowing layout viewport element
                this.setScrollContainer(os.elements().viewport);
                this.enable();
            }
        });
    }

    ...
}
```

``` twig
<div {{ stimulus_controller('my-infinite-scroll', {'loadMoreDirection': 'down', 'nbPages': 10, customScrollContainer': true}) }} >
</div>
```

## Config
Configure the controller configuration using standard Stimulus Data Values:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `currPage` | Number | `1` | The starting page index which is incremented/decremented automatically when new content is loaded for insertion. |
| `nbPages` | Number | *Required* | The absolute upper limit boundary of available pages. Loding more content is halted when this limit is reached. |
| `triggerDistanceEm` | Number | `10` | Lookahead threshold margin calculated in `em` units relative to the container boundaries before firing `loadMoreCallback`. |
| `loadMoreDirection` | String | `'down'` | Permitted options: `'up'`, `'down'`, `'left'`, `'right'`. |
| `customScrollContainer` | Boolean | `false` | If set to `true`, halts automatic initialization, allowing to set the scroll container later after `connect()` was fired. |
| `autoFill` | Boolean | `false` | When true, automatically fills the container with new content until its scrollable. |
| `insertTargetQuerySelector` | String | `null` | CSS query selector of child element relative to the default scroll container. If specified, the new content is inserted here instead of the default (parent) scroll container. |

## Callbacks

### `loadMoreCallback(formData: FormData): Promise<string>`

The primary abstract method executing async interactions. This **must** be implemented within your extending subclass.

* **Arguments:** An instance of `FormData` replicating any previously bound application data and carrying the updated `page` value.
* **Expected Return:** A `Promise` resolving to an HTML string slice containing the markup of your new elements.


## Events

### `elements-added`

Dispatched natively upon successful injection of new elements into the target scroll container.

* **`event.target`**: The container in which new elements were inserted.
* **`event.detail.newElems`**: An array containing the newly inserted elements.

There are two ways to listen inside `my-infinite-scroll` or any other controller:

#### First approach:
```js
this.element.addEventListener('my-infinite-scroll:elements-added', (e) => 
{
    console.log("Newly inserted elements:", e.detail.newElems);
});
```

#### Second approach:
``` twig
<div {{ stimulus_controller('some-other') }} 
{{ stimulus_action(
    'some-other', 
    'elementsAddded', 
    'my-infinite-scroll:elements-added'
) }}>
</div>
```
Then inside `some-other` controller implement method:
```js
elementsAddded(e)
{
    console.log("Newly inserted elements:", e.detail.newElems);
}
```


## Methods
The following public methods are available directly on your extended controller instance:

* **`enable(): Promise<void>`** 
* **`disable(): void`**
* **`setBaseFormData(formData: FormData): void`**
* **`setScrollContainer(scrollContainer: HTMLElement): void`**
* **`getScrollContainer(): HTMLElement | null`**
* **`autoFill(): Promise<void>`**