# coin-script

一个简单、安全的 web3 脚本库

- [coin-script](#coin-script)
  - [使用说明](#使用说明)
    - [lava](#lava)
      - [批量注册](#批量注册)
      - [查询积分](#查询积分)
      - [刷积分](#刷积分)
      - [注意事项](#注意事项)
    - [sollong](#sollong)
      - [每日签到](#每日签到)
      - [刷邀请积分](#刷邀请积分)
      - [批量查询积分与 SOL 资产](#批量查询积分与-sol-资产)
  - [项目说明](#项目说明)
  - [开发说明](#开发说明)
    - [依赖项说明](#依赖项说明)

## 使用说明

当前只支持 `Linux` 和 `Mac`，如果想在 windows 上使用，可以使用 `WSL`。

1. 安装 `bun`(nodejs 运行时)，已经有 nodejs 环境的可以使用 `npm i -g bun` 安装，否则使用 `curl -fsSL https://bun.sh/install | bash` 下载安装
2. 安装依赖 `bun install`， ~~当前只依赖了 `ethers`，**为降低安全风险不建议再使用其他依赖**~~，依赖项说明见下方[依赖项说明](#依赖项说明)

> 如不使用 bun，也可以把 ts 文件中的代码转为 js 代码使用

### lava

#### 批量注册

获取 lava rpc id 可以使用 `bun run lava/util.ts` 脚本获得，建议在本地生成，再更新到配置文件中，这里的助记词一定要记录好，否则找不回钱包

```ts
function main() {
    // 生成 rpc id，日志中的助记词需要记录下来，仅用于生成 rpc id
    generateRPCs(10);
}
```

#### 查询积分

使用 `bun run lava/util.ts` 查询积分，按需使用助记词或私钥查询，**因为登录需要钱包签名，所以需要用到助记词或私钥。**

```ts
function main() {
    // 通过助记词查询积分信息，比上面的方法多调一个接口
    queryMeByMnemonic('word1 word2 word3 ...', 10);


    // 通过私钥查询积分信息，比上面的方法多调一个接口
    // queryMeByKeys(['0x...', '0x...']);
}
```

#### 刷积分

lava net 的积分是通过调用 rpc 节点获得，使用 `lava/rpc.ts` 脚本，单个 rpc 节点会串行调用，如需单个节点并发，可在配置中配置两次

1. 在 [lava](https://points.lavanet.xyz/) 获取 rpc 节点
2. 将获取到的 rpc 节点配置到 `config.toml` 中
3. 使用 `nohup bun run lava/rpc.ts >> logs/lava.log 2>&1 &` 后台运行，如果是在服务器上运行，请在断开远程连接后再登录确定进程是否正常

#### 注意事项

- 登录环节中会用到私钥进行签名，签名的内容由 lava 后台返回，存在安全风险！**避免使用存在大额资金的钱包登录**

### sollong

[sollong](https://app.sollong.xyz/) 可使用邀请码 `ea6m5z`，当前脚本使用了兼容 `phantom` 钱包的算法，可以直接把助记词导入 `phantom` 使用

使用步骤

1. 将可用的、或者需要刷邀请积分的邀请码配置到 `config.toml` 中的 `inviteCodes`
2. 将需要刷签到的钱包助记词配置到 `config.toml` 中的 `mnemonic`
3. 完成配置后执行 `bun run sollong/index.ts >> logs/sollong.log 2>&1 &` 即可后台运行


#### 每日签到

本地生成助记词（最好是新的，避免安全风险）后配置到 `config.toml` 中，配置通过助记词派生的钱包数量 `wallet.count` 即需要刷的钱包数量。


#### 刷邀请积分

只刷邀请积分**可以不用提供助记词、私钥**

把生成的邀请码，添加到配置文件 `config.toml` 中即可，会跟上面的签到一起执行

#### 批量查询积分与 SOL 资产

执行 `bun run sollong/util.ts` 即可


## 项目说明

| 名称 | 交互类型 | 成本 | 生态 | 备注 |
| -- | -- | -- | -- | -- |
| lava | rpc 节点调用 | 低 | Cosmos | 签名的数据由 lava 后台指定，存在安全风险 |
| frame | 智能合约交互 | 低 | | 需要领水 Sepolia、测试网 |
| sollong | 邀请、签到 | 低 | SOL | 需要钱包密钥签名 |

## 开发说明

待开发

- [ ] 代理
- [ ] 钱包管理

### 依赖项说明

| 依赖项 | 用途 | 备注 |
| -- | -- | -- |
| ethers | eth 生态交互支持 | 签名、智能合约交互、交易 |
| bip39 | 助记词生成 seed | 支持 HD 钱包 |
| micro-ed25519-hdkey | HD 钱包派生 | 支持 HD 钱包 |
| tweetnacl | 签名 | |
| @solana/web3.js | sol 生态支持 | 当前只用到了 HD 钱包 |



