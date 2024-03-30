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
      - [邀请码邀请的帐号刷积分](#邀请码邀请的帐号刷积分)
      - [批量查询积分与 SOL 资产](#批量查询积分与-sol-资产)
    - [eclipse](#eclipse)
      - [跨链交互](#跨链交互)
    - [代币交互](#代币交互)
    - [invariant 交互 (官方)](#invariant-交互-官方)
    - [spepe](#spepe)
    - [soll](#soll)
    - [grass](#grass)
  - [项目说明](#项目说明)
  - [开发说明](#开发说明)
    - [依赖项说明](#依赖项说明)

## 使用说明

当前只支持 `Linux` 和 `Mac`，如果想在 windows 上使用，可以使用 `WSL`。

1. 安装 `bun`(nodejs 运行时)，已经有 nodejs 环境的可以使用 `npm i -g bun` 安装，否则使用 `curl -fsSL https://bun.sh/install | bash` 下载安装
2. 安装依赖 `bun install`， ~~当前只依赖了 `ethers`，**为降低安全风险不建议再使用其他依赖**~~，依赖项说明见下方[依赖项说明](#依赖项说明)
3. 每次依赖更新请先使用 `bun install` 安装依赖

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

lava net 的积分是通过调用 rpc 节点获得，使用 `lava/rpc.ts` 脚本，单个 rpc 节点会串行调用，脚本中分别会通过查询`钱包资产`和`代币资产`来刷积分

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
3. 完成配置后执行 `nohup bun run sollong/index.ts >> logs/sollong.log 2>&1 &` 即可后台运行


#### 每日签到

本地生成助记词（最好是新的，避免安全风险）后配置到 `config.toml` 中，配置通过助记词派生的钱包数量 `wallet.count` 即需要刷的钱包数量。


#### 刷邀请积分

只刷邀请积分**可以不用提供助记词、私钥**

把生成的邀请码，添加到配置文件 `config.toml` 中即可，会跟上面的签到一起执行

#### 邀请码邀请的帐号刷积分

邀请码邀请的帐号每天都签到，一个邀请码会对应一个 HD 钱包助记词存储到 `sollong/data.json` 文件中


#### 批量查询积分与 SOL 资产

执行 `bun run sollong/util.ts` 即可

### eclipse

solana 生态的 L2，测试网激励

先将本地生成的助记词(优先使用新的)配置到配置文件中，然后执行 `bun run eclipse/util.ts` 查询需要领水的地址(sepolia)

#### 跨链交互

从 sepolia 跨链到 eclipse testnet，需要从 sepolia 领水，很多水龙头都限制了只给主网有 ETH 资产的地址

执行脚本 `nohup bun run eclipse/bridge.ts >> logs/eclipse-bridge.log 2>&1 &`


### 代币交互

- 创建代币
- 铸造代币
- 发送代币

执行脚本 `nohup bun run eclipse/token.ts >> logs/eclipse-token.log 2>&1 &`

### invariant 交互 (官方)

领取 eclipse 的水，和批量领取 USDT, BTC, ETH 的水，swap 的交互还未开发

`nohup bun run eclipse/invariant.ts >> logs/eclipse-invariant.log 2>&1 &`

### spepe

直接用 sol 钱包登记即可，邀请码可以邀请 20 个再获得 20 份奖励。
执行时，会分别从 `spepe/config.toml` 和 `spepe/data.json` 中获取邀请码，并让每个邀请码邀请 20 次。`spepe/config.toml` 文件中至少要配置一个可用的邀请码

由于不确定邀请码总共只能邀请 20 次，先存到文件中

1. 执行 `nohup bun run spepe/index.ts >> logs/spepe.log 2>&1 &`
2. 执行完成后会把新的助记词和邀请码保存到 `spepe/data.json` 文件中

### soll

登记钱包地址即可，站点代码和 `spepe` 差不多，估计是同一个项目方。募集的钱包地址里面已经有了**500+** SOL，且站点还没有加人机验证，可以先刷。

1. 先在 [soll.cc](https://soll.cc) 登记一个钱包，然后把邀请码复制到 `soll/config.toml` 中
2. 执行 `bun run soll/index.ts`，每个邀请码会邀请 5~15 个钱包，并将最终的用到的助记词和最新可用的邀请码放到 `soll/data.json` 中

每次执行登记的地址数量为，`soll/config.toml` 配置的邀请码数 * 随机邀请数（5~15），如 `soll/data.json` 中存在邀请码，则以这个为准。

> 单个 ip 不建议过多，否则容易被女巫

### grass

在本地获取到 `userId` 后配置到配置文件 `config.toml` 中，执行 `nohup bun run grass/index.ts >> logs/grass.log 2>&1 &` 即可

从插件源码中获悉，当前挖矿的逻辑基本上为保持 `WebSocket` 在线即可。
核心挖矿逻辑为，将通过 `WebSocket` 分发指定报文信息中的 `base64` 字符串转为 `Blob`（二进制）调用指定 `url` 请求。（当前未见分发过该类型报文）


## 项目说明

| 名称 | 交互类型 | 成本 | 生态 | 备注 | 进度 |
| -- | -- | -- | -- | -- | -- |
| lava | rpc 节点调用 | 低 | Cosmos | 签名的数据由 lava 后台指定，存在安全风险 | 官方开始封 ip，无法正常刷|
| frame | 智能合约交互 | 低 | | 需要领水 Sepolia、测试网 | 据说项目已经失败 |
| sollong | 邀请、签到 | 低 | SOL | 加入了验证码，无法正常签到 | |
| grass | 挖矿 | 中 | | 按公网 ip 计算，云服务器 ip 无积分 | 4.9 第三期挖矿结束 |
| spepe | 登记钱包地址 | 低 | SOL | 脚本失效，官网加了人机检查 | 未按计划发币 |
| soll | 登记钱包地址 | 低 | SOL | 募集到了一些 SOL，可能有空投（疑似 spepe 同一项目方）| 未按计划发币 |

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
| tweetnacl | solana 签名 | |
| @solana/web3.js | sol 生态支持 |  |
| @solana/spl-token-metadata | sol 代币创建 | |
| @solana/spl-token | sol 代币交互 | |
| @metaplex-foundation/js | sol NFT 交互 | |




