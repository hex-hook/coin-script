declare module '@/eclipse/config.toml' {
    export type Config = {
        sepolia: {
            /**
             * sepolia rpc 节点，国内一些节点需要梯子，可以从 chainlist.org 上找到
             */
            rpc: string
            /**
             * gas 上限
             */
            gas: string
        },
        wallet: {
            /**
             * 用于刷交互的钱包助记词
             */
            mnemonic: string
            count: number
            invariantCount: number
            skipBalance: number
        },
        eclipse: {
            /**
             * eclipse rpc 节点，可以在官方文档上找到
             */
            rpc: string
        }
    }
    const config: Config
    export default config
}