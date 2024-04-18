// import { waitReady } from "@polkadot/wasm-crypto";
import { ApiPromise, Keyring, WsProvider } from "@polkadot/api";
import config from '@/avail/config.toml'
import type { KeyringPair } from "@polkadot/keyring/types";
import { nowDateTimeString, sleepRandom } from "../util/time";
import { v4 } from "uuid";
import { BN } from "bn.js";
import { types } from './spec/types'
import { rpc } from './spec/rpc'
import { signedExtensions } from './spec/signedExtensions'
import { cryptoWaitReady } from "@polkadot/util-crypto";

const options = { app_id: 0, nonce: -1 }
// 0.02
const minBalance = new BN(10).pow(new BN(18)).divn(50)

async function init(): Promise<ApiPromise> {
    await cryptoWaitReady()
    const provider = new WsProvider(config.ws)
    const api = await ApiPromise.create({ 
        provider,
        noInitWarn: true,
        types,
        rpc,
        signedExtensions
    })
    return api
}

async function mintNFT(api: ApiPromise, keypair: KeyringPair): Promise<boolean> {
    const { data } = (await api.query.system.account(keypair.address)) as unknown as { data: any };
    if (data.free.lt(minBalance)) {
        console.warn(`${nowDateTimeString()} [${keypair.address}] free balance not enough`)
        return false
    }
    const txData = {
        "p": "ALC-721",
        "op": "mint",
        "tick": "ALC_NFT",
        "amt": 1,
        "usr": keypair.address,
        "id": v4(),
        "lc_address": null,
        "img": "https://rose-select-sole-942.mypinata.cloud/ipfs/Qmc7PCgxTy7UFKSfMhnHHznhP3ER9JqqzwgRpJWkQ8Rftm?pinataGatewayToken=cxrGWSCO0-11j1FGO99qjIG0stO8TSqzBUrdtl5EDmEG37vl4aXrsZdtQPmrrbBT"
    }
    const tx = api.tx.system.remarkWithEvent(JSON.stringify(txData))
    const hash = await tx.signAndSend(keypair, options)
    console.log(`${nowDateTimeString()} [${keypair.address}] mint nft tx hash: ${hash}`)
    return true
}

async function task(api: ApiPromise, mnemonic: string) {
    const lastIndex = config.wallet.lastIndex
    console.log(`${nowDateTimeString()} start task, lastIndex: ${lastIndex}`)
    let success = 0

    for (let i = 0; i < lastIndex; i++) {
        const keypair = new Keyring({ type: 'sr25519' }).createFromUri(`${mnemonic}//${i}`)
        console.log(`${nowDateTimeString()} [${keypair.address}], [${i}]`)
        try {
            const res = await mintNFT(api, keypair)
            if (res) {
                success++
            }
        } catch (error) {
            console.error(`${nowDateTimeString()} [${keypair.address}]`, error)
            continue
        }
        // 等待 5s 到 20s
        await sleepRandom(5 * 1000, 20 * 1000)
    }
    console.log(`${nowDateTimeString()} task done, mint nft success ${success}/${lastIndex+1}`)
}


async function main() {
    const mnemonic = config.wallet.mnemonic
    if (config.wallet.mnemonic.split(' ').length < 12) {
        console.error('mnemonic is invalid, see config.toml')
        return
    }
    const api = await init()
    try {
        await task(api, mnemonic)
    } catch(error) {
        console.error(error)
    } finally {
        await api.disconnect()
    }
}

main()
