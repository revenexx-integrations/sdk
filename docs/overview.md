# @revenexx/integrations-node-sdk

Shared TypeScript contract library for Revenexx integration nodes. Defines the interfaces every node must implement and ships helpers used by the node registry.

## Contents

- [Architecture](#architecture)
- [Types](#types)
- [Writing a Node](#writing-a-node)
- [Manifest Helpers](#manifest-helpers)
- [Publishing](#publishing)
- [Consuming the Package](#consuming-the-package)

---

## Architecture

```
integrations-node-sdk          (this package)
  └── INode, INodeDescription, INodeContext, INodeResult, ...

integrations-nodes-core        (consumes this package)
  └── DownloadNode implements INode
  └── ...more nodes
  └── dist/manifest.json       (built via extractManifests)
```

The SDK has no runtime dependencies and no logic beyond the manifest helpers. It exists solely to share the contract between node packages and the workflow engine.

---

## Types

### `INode`

The interface every node class must implement.

```ts
interface INode {
  description: INodeDescription;
  execute(ctx: INodeContext, input: unknown): Promise<INodeResult>;
}
```

---

### `INodeDescription`

Static metadata about the node. Read at registry build time — never at runtime.

| Field | Type | Description |
|---|---|---|
| `slug` | `string` | Unique identifier, e.g. `rvnxx:download` |
| `version` | `string` | Semver string |
| `category` | `NodeCategory` | `trigger \| action \| transform \| control \| io` |
| `name` | `LocalizedString` | Display name |
| `description` | `LocalizedString?` | Optional longer description |
| `icon` | `string?` | Icon identifier, e.g. `mdi:cloud-download` |
| `input` | `IInputPort` | Single input port definition |
| `outputs` | `IOutputPort[]` | One or more output ports |
| `config` | `IConfigField[]?` | User-configurable fields |

---

### `INodeContext`

Injected into `execute()` at runtime by the workflow engine.

```ts
interface INodeContext {
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  secrets: {
    get(key: string): Promise<string>;
  };
}
```

`secrets.get(key)` resolves a secret by the key stored in a `secret-ref` config field.

---

### `INodeResult`

What `execute()` must return.

```ts
interface INodeResult {
  outputs: Record<string, unknown>;  // keyed by output port name
  branch?: string;                   // which output port to route through
}
```

---

### `IOutputPort`

| Field | Type | Description |
|---|---|---|
| `kind` | `OutputKind` | `default \| branch \| error` — controls routing in the workflow engine |
| `dataType` | `DataType` | `any \| object \| array \| string \| number \| boolean` |
| `name` | `string?` | Port name, referenced in `INodeResult.branch` |
| `label` | `LocalizedString?` | Display label |
| `sourceFromConfig` | `string?` | Dynamically names the port from a config field value |
| `fallback` | `object?` | Fallback name/label when `sourceFromConfig` resolves to nothing |

---

### `IConfigField`

Describes a user-configurable input on the node. Rendered as a form field in the UI.

| `type` | Rendered as |
|---|---|
| `string` | Text input |
| `number` | Number input |
| `boolean` | Toggle |
| `select` | Dropdown (requires `options`) |
| `multiselect` | Multi-select (requires `options`) |
| `object` | Nested fields (requires `properties`) |
| `array` | Repeatable field (requires `items`) |
| `expression` | Expression editor |
| `secret-ref` | Credential picker — value is resolved via `ctx.secrets.get()` at runtime |

---

### `LocalizedString`

All user-visible text fields accept either a plain string or a locale map:

```ts
type LocalizedString = string | Record<string, string>;

// both valid:
name: 'Download'
name: { en: 'Download', de: 'Herunterladen' }
```

---

## Writing a Node

```ts
import type { INode, INodeContext, INodeResult } from '@revenexx/integrations-node-sdk';

export class MyNode implements INode {
  description = {
    slug: 'rvnxx:my-node',
    version: '1.0.0',
    category: 'action' as const,
    name: { en: 'My Node' },
    input: { dataType: 'object' as const, required: true },
    outputs: [
      { name: 'out', kind: 'default' as const, dataType: 'object' as const },
      { name: 'error', kind: 'error' as const, dataType: 'object' as const },
    ],
    config: [
      {
        key: 'credentials',
        label: { en: 'Credentials' },
        type: 'secret-ref' as const,
        required: true,
      },
    ],
  };

  async execute(ctx: INodeContext, input: unknown): Promise<INodeResult> {
    const token = await ctx.secrets.get(/* value of credentials field */ 'my-secret-key');

    ctx.logger.info('MyNode executing', { input });

    return {
      outputs: { result: { ok: true } },
      branch: 'out',
    };
  }
}
```

Register the node in `integrations-nodes-core/src/index.ts`:

```ts
import { MyNode } from './nodes/my-node/MyNode.js';

export const NODES: INode[] = [
  new DownloadNode(),
  new MyNode(),
];
```

---

## Manifest Helpers

`extractManifest` / `extractManifests` pull the `INodeDescription` off node instances without executing them. Used by `integrations-nodes-core`'s build script to generate `dist/manifest.json`.

```ts
import { extractManifests } from '@revenexx/integrations-node-sdk';
import { NODES } from './index.js';

const manifests = extractManifests(NODES);
// → INodeDescription[]
```

---

## Publishing

The package is published to GitHub Packages (`https://npm.pkg.github.com`).

**Prerequisites — one-time setup:**

1. Create a GitHub Classic Personal Access Token with `write:packages` scope.
2. Add it to `~/.npmrc`:
   ```
   //npm.pkg.github.com/:_authToken=ghp_YOUR_TOKEN
   ```

**Release:**

```bash
# bump version in package.json first
npm run build
npm publish
```

Use `npm publish --dry-run` to verify what will be uploaded without actually publishing.

---

## Consuming the Package

Add a `.npmrc` to your project so npm knows where to find `@revenexx/` scoped packages:

```
@revenexx:registry=https://npm.pkg.github.com
```

Then install normally:

```bash
npm install @revenexx/integrations-node-sdk
```
