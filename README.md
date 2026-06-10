[![NPM Downloads](https://img.shields.io/npm/dm/%40dpsys%2Faxios-loader)](https://www.npmjs.com/package/@dpsys/axios-loader)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](https://www.typescriptlang.org/)
[![ISC License](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

# Axios Loader

Add custom spinners, popups, or loading indicators to improve user experience during Axios requests.

Supports CJS and ESM.

## Features

- **Loader Management** - Automatically show/hide custom loaders
- **Page Interaction Control** - Disable UI interactions during requests
- **Factory Pattern Configuration**

## Installation

```bash
npm i @dpsys/axios-loader
```

## Example Usage
**1. Make (or update existing) Axios instance:**
```js
import { AxiosLoader } from '@dpsys/axios-loader';

let axiosLoaderInstance = new AxiosLoader
(
	// Axios config or an existing Axios instance
	{
		baseURL: 'https://test.com',
	},
	// Loader config
	{
		loaderShowAfterMs: 300, 
		loaderMessage: 'Loading ...'
	}
)
.setLoaderCallbacks
(
	// showLoaderCallback
    (requestID, loaderMessage) => console.log(`Showing loader ${requestID} with message: ${loaderMessage}`),
	// hideLoaderCallback
    (requestID) => console.log(`Hiding loader ${requestID}`)
);

export const axiosLoader = axiosLoaderInstance.getAxiosInstance();
// export default axiosLoaderInstance.getAxiosInstance();
```

**2. Use it in your app**
- Loader config can be overriden here
```js
import {axiosLoader} from '../lib/axios/default';

axiosLoader.post('/some-route', {data: 'foo'}, {loaderMessage: 'Different loader message...', disablePageInteraction: false});
.then( async (response) =>
{
	...
});
```

## Config

| Option                   | Type    | Default           | Description                                                                   |
|--------------------------|---------|-------------------|-------------------------------------------------------------------------------|
| `loaderShow`             | boolean | `false`           | Whether to show the loader. Is automatically enabled after setting callbacks via `setLoaderCallbacks`. |
| `loaderShowAfterMs`      | number  | `200`             | Delay in milliseconds before the loader appears.                            |
| `loaderMessage`          | string  | `Please wait ...` | Message displayed in the loader.                                             |
| `loaderNeverHide`        | boolean | `false`           | If true, loader is never removed after request has finished. |
| `disablePageInteraction` | boolean | `true`            | Whether to prevent user page interaction during each request.                |

## Callbacks
- `showLoaderCallback(requestID: number, message: string)`: Implement this callback to show your loader.
- `hideLoaderCallback(requestID: number)`: Implement this callback to hide your loader.

## Methods
- `setLoaderCallbacks(showLoaderCallback, hideLoaderCallback)`: see Callbacks section