# coin-script

一个简单、安全的 web3 脚本库

## 使用说明

1. 安装 `bun`(nodejs 运行时)，`npm i -g bun`
2. 安装依赖 `bun install`， 当前只依赖了 `ethers`，**为降低安全风险不建议再使用其他依赖**

> 如不使用 bun，也可以把 ts 文件中的代码转为 js 代码使用

### lava

获取 lava rpc id 可以使用 `bun run lava/util.ts` 脚本获得，建议在本地生成，再更新到配置文件中，这里的助记词一定要记录好，否则找不回钱包

lava net 的积分是通过调用 rpc 节点获得，使用 `lava/rpc.ts` 脚本，单个 rpc 节点会串行调用，如需单个节点并发，可在配置中配置两次

1. 在 [lava](https://points.lavanet.xyz/) 获取 rpc 节点
2. 将获取到的 rpc 节点配置到 `config.toml` 中
3. 使用 `bun lava/rpc.ts > lava.log &` 后台运行

## 项目说明

| 名称 | 交互类型 | 成本 | 生态 | 备注 |
| -- | -- | -- | -- | -- |
| lava | rpc 节点调用 | 低 | | |
| frame | 智能合约交互 | 低 | | 需要领水 Sepolia、测试网 |

## 开发说明

待开发

- [ ] 代理
- [ ] 钱包管理




