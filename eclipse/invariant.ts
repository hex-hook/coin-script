import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import config from './config.toml'
import { HDWallet } from '../util/solana'
import { randomIndexList } from '../util/random'
import { nowDateTimeString, sleepRandom } from '../util/time'
const { Connection } = require('@solana/web3.js')


/**
 * 领水
 * @param index 钱包索引
 */
async function faucetTask(index: number) {
    const connection = new Connection(config.eclipse.rpc)
    const mnemonic = config.wallet.mnemonic
    // invariant 站点空投账户源码 https://github.com/invariant-labs/webapp/blob/master/src/store/consts/airdropAdmin.ts
    const payer = Keypair.fromSecretKey(Buffer.from([
        85, 51, 81, 126, 224, 250, 233, 174, 133, 40, 112, 237, 109, 244, 6, 62, 193, 121, 239, 246, 11,
        77, 215, 9, 0, 18, 83, 91, 115, 65, 112, 238, 60, 148, 118, 6, 224, 47, 54, 140, 167, 188, 182,
        74, 237, 183, 242, 77, 129, 107, 155, 20, 229, 130, 251, 93, 168, 162, 156, 15, 152, 163, 229, 119
    ]))
    // 固定金额，避免被判断为女巫
    const lamportsToSend = LAMPORTS_PER_SOL * 0.00003;
    const target = new HDWallet(mnemonic, `m/44'/501'/${index}'/0`).keypair.publicKey
    const transferTransaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: target,
            lamports: lamportsToSend,
        })
    );

    await sendAndConfirmTransaction(connection, transferTransaction, [
        payer,
    ]);
    console.log(`${nowDateTimeString()} [invariant faucet] faucet success, wallet index: [${index}], target: ${target.toBase58()}`)
}


async function runTask() {
    const indexList = randomIndexList(config.wallet.count).splice(Math.floor(config.wallet.count / 2))
    console.log(`${nowDateTimeString()} [invariant faucet] start task, total: ${indexList.length}, index: [${indexList}]`)
    for (const index of indexList) {
        try {
            await faucetTask(index)
        } catch (e) {
            console.error(`${nowDateTimeString()} [invariant faucet] task error, wallet index: [${index}]`, e)
        }
        // 随机等待 2-60 分钟
        await sleepRandom(1000 * 60 * 2, 1000 * 60 * 60)
    }
}

async function main() {
    if (config.wallet.mnemonic.split(' ').length < 12) {
        console.error('mnemonic is invalid, see config.toml')
        return
    }
    while (true) {
        try {
            await runTask()
        } catch (e) {
            console.error(`${nowDateTimeString()} [eclipse token] main error`, e)
        }
        // 随机等待 10 ~ 24 小时
        await sleepRandom(1000 * 60 * 60 * 10, 1000 * 60 * 60 * 24)
    }
}

main()