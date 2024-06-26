declare module '@/avail/config.toml' {
    type Config = {
        /**
         * avail rpc 节点
         */
        ws: string
        wallet: {
            /**
             * 用于刷交互的钱包助记词
             */
            mnemonic: string
            /**
             * 用于发水的钱包助记词
             */
            faucetMnemonic: string
            lastIndex: number
        }
    }

    const config: Config;
    export default config;
}