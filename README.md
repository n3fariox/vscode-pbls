# vscode-pbls

[![CI](https://github.com/n3fariox/vscode-pbls/actions/workflows/ci.yml/badge.svg)](https://github.com/n3fariox/vscode-pbls/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/n3fariox/vscode-pbls/branch/master/graph/badge.svg)](https://codecov.io/gh/n3fariox/vscode-pbls)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/n3fariox.vscode-pbls?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=n3fariox.vscode-pbls)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/n3fariox.vscode-proto3)](https://marketplace.visualstudio.com/items?itemName=n3fariox.vscode-pbls)

Protobuf support for Visual Studio Code powered by [pbls](https://github.com/rcorre/pbls) language server.

## History

This was forked from the fantastic https://github.com/zxh0/vscode-proto3.

The forced deprecation/redirection did not sit well with me and I never needed
much more features than what it already had.

At the same time, a good friend made pbls and I wanted to use it in vscode.

https://github.com/rcorre/pbls

## Features

- Syntax highlighting for `.proto` files
- Code completion (messages, enums, keywords)
- Go-to-definition for types and imports
- Find all references
- Document and workspace symbol search
- Diagnostics via `pbls`
- Formatting via `clang-format`

## Requirements

- Install [pbls](https://github.com/rcorre/pbls) language server
    - Extension will prompt and install if it's not installed
- (Optional) `clang-format` for formatting
- (Optional) `protoc` for diagnostics (used by pbls)

## Configuration

### pbls

Create a `.pbls.toml` in your workspace root:

```toml
proto_paths = ["path/to/protos", "/usr/include"]
```

Configure the pbls path in VS Code settings:

```json
{
  "pbls.path": "/path/to/pbls"
}
```

### clang-format

```json
{
  "clang-format.style": "google",
  "clang-format.executable": "clang-format"
}
```

## Snippets

| prefix | body |
| --- | --- |
| sp2 | `syntax = "proto2";` |
| sp3 | `syntax = "proto3";` |
| pkg | `package package.name;` |
| imp | `import "path/to/other/protos.proto";` |
| ojp | `option java_package = "java.package.name";` |
| ojoc | `option java_outer_classname = "ClassName";` |
| o4s | `option optimize_for = SPEED;` |
| o4cs | `option optimize_for = CODE_SIZE;` |
| o4lr | `option optimize_for = LITE_RUNTIME;` |
| odep | `option deprecated = true;` |
| oaa | `option allow_alias = true;` |
| msg | `message MessageName {}` |
| fbo | `bool field_name = tag;` |
| fi32 | `int32 field_name = tag;` |
| fi64 | `int64 field_name = tag;` |
| fu32 | `uint32 field_name = tag;` |
| fu64 | `uint64 field_name = tag;` |
| fs32 | `sint32 field_name = tag;` |
| fs64 | `sint64 field_name = tag;` |
| ff32 | `fixed32 field_name = tag;` |
| ff64 | `fixed64 field_name = tag;` |
| fsf32 | `sfixed32 field_name = tag;` |
| fsf64 | `sfixed64 field_name = tag;` |
| ffl | `float field_name = tag;` |
| fdo | `double field_name = tag;` |
| fst | `string field_name = tag;` |
| fby | `bytes field_name = tag;` |
| fm | `map<key, val> field_name = tag;` |
| foo | `oneof name {}` |
| en | `enum EnumName {}` |
| sv | `service ServiceName {}` |
| rpc | `rpc MethodName (Request) returns (Response);` |
| svgapi | Google API standard methods |

## Development

- Install dependencies: `npm install`
- Build: `npm run build`
- Package: `npm run package:vsix`

## Troubleshooting

- `pbls` not found: install pbls or update `pbls.path` setting
- `spawnsync clang-format enoent`: install `clang-format` or update `clang-format.executable`
- Diagnostics not working: ensure `protoc` is installed and `.pbls.toml` is configured

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md). PRs are welcome!

## Top contributors

![Top contributors](https://contrib.rocks/image?repo=n3fariox/vscode-pbls)

See the full list on GitHub in the [contributors graph](https://github.com/n3fariox/vscode-pbls/graphs/contributors).

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
