import { Keypair } from "@solana/web3.js";
// 参考 https://solanacookbook.com/references/keypairs-and-wallets.html
import { HDKey } from "micro-ed25519-hdkey";
import * as bip39 from "bip39";
import { ethers } from "ethers";


export class HDWallet {
    readonly mnemonic: string;
    readonly path: string;
    readonly address: string;
    readonly key: string;
    readonly keypair: Keypair;

    constructor(mnemonic: string, path?: string) {
        this.mnemonic = mnemonic;
        if (!path) {
            path = "m/44'/501'/0'/0";
        }
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        this.path = path;
        const hd = HDKey.fromMasterSeed(seed);
        const keypair = Keypair.fromSeed(hd.derive(path, true).privateKey);
        this.address = keypair.publicKey.toBase58();
        this.key = ethers.encodeBase58(keypair.secretKey)
        this.keypair = keypair;
    }

    /**
     * 基于当前 node 派生
     * m/44'/501'/0'/0 派生后的路径为 m/44'/501'/0'/0/${index}
     * @param index 地址索引
     * @returns 
     */
    deriveChild(index: number): HDWallet {
        return new HDWallet(this.mnemonic, `${this.path}/${index}`);
    }
    /**
     * 派生账户
     * phantom 钱包是使用这种方式派生的
     * @param index 账户索引
     * @returns 
     */
    derive(index: number): HDWallet {
        return new HDWallet(this.mnemonic, `m/44'/501'/${index}'/0`);
    }

    /**
     * 生成 HD 钱包
     * @returns 
     */
    static generate(): HDWallet {
        return new HDWallet(bip39.generateMnemonic());
    }
}




