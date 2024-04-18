import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import config from '@/eclipse/config.toml'
import { HDWallet } from '../util/solana'
import { randomIndexList, randomInt } from '../util/random'
import { nowDateTimeString, sleepRandom, getSleepScope } from '../util/time'
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddress } from '@solana/spl-token'

interface TokenInfo {
    name: string
    mint: PublicKey
    decimals: number
    amount: number,
    randomAmounts: number[]
}

// invariant 站点空投账户源码 https://github.com/invariant-labs/webapp/blob/master/src/store/consts/airdropAdmin.ts
const invariantPayer = Keypair.fromSecretKey(Buffer.from([
    85, 51, 81, 126, 224, 250, 233, 174, 133, 40, 112, 237, 109, 244, 6, 62, 193, 121, 239, 246, 11,
    77, 215, 9, 0, 18, 83, 91, 115, 65, 112, 238, 60, 148, 118, 6, 224, 47, 54, 140, 167, 188, 182,
    74, 237, 183, 242, 77, 129, 107, 155, 20, 229, 130, 251, 93, 168, 162, 156, 15, 152, 163, 229, 119
]))

const USDC_MINT = new PublicKey('5gFSyxjNsuQsZKn9g5L9Ky3cSUvJ6YXqWVuPzmSi8Trx');
const BTC_MINT = new PublicKey('2F5TprcNBqj2hXVr9oTssabKdf8Zbsf9xStqWjPm8yLo');
// 不要随意调整金额，避免被判断为女巫
const TOKEN_INFO_DICT = {
    USDC: {name: 'USDC', mint: USDC_MINT, decimals: 9, amount: 10, randomAmounts: [0.5, 1, 2, 3.5, 5, 8]},
    BTC: {name: 'BTC', mint: BTC_MINT, decimals: 9, amount: 0.00025, randomAmounts: [0.0001, 0.0002, 0.00013, 0.00015, 0.00018, 0.00023]},
}


async function faucet(keypair: Keypair) {
    const connection = new Connection(config.eclipse.rpc, 'confirmed')
    const transferTransaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: invariantPayer.publicKey,
            toPubkey: keypair.publicKey,
            lamports: LAMPORTS_PER_SOL * 0.00003,
        })
    );
    await sendAndConfirmTransaction(connection, transferTransaction, [
        invariantPayer,
    ]);
    console.log(`${nowDateTimeString()} [invariant faucet] faucet success, target: ${keypair.publicKey.toBase58()}`)
    
    // 等待 30s ~ 100s，区块确认
    await sleepRandom(1000 * 30, 1000 * 100)
}

async function createTokenAccounts(keypair: Keypair, mintList: PublicKey[]): Promise<PublicKey[]> {
    const ataList: PublicKey[] = []
    const tx = new Transaction()
    for (const mint of mintList) {

        const ata = await getAssociatedTokenAddress(mint, keypair.publicKey, undefined, TOKEN_PROGRAM_ID)
        ataList.push(ata)
        tx.add(
            createAssociatedTokenAccountInstruction(
                keypair.publicKey,
                ata,
                keypair.publicKey,
                mint,
                TOKEN_PROGRAM_ID
            )
        )
    }
    const sign = await sendAndConfirmTransaction(new Connection(config.eclipse.rpc, 'confirmed'), tx, [keypair])
    console.log(`${nowDateTimeString()} [invariant faucet] create associated token account success, target: ${keypair.publicKey.toBase58()}, sig: ${sign}`)
    await sleepRandom(1000 * 30, 1000 * 100)
    return ataList
}


async function faucetTask(keypair: Keypair) {
    const connection = new Connection(config.eclipse.rpc, 'confirmed')
    const balance = await connection.getBalance(keypair.publicKey)
    // 资产不足时领水，资产充足时有 60% 几率领水
    let needFaucet = (balance < LAMPORTS_PER_SOL * 0.00002) || randomInt(0, 10) < 6

    // 检查 usdc 和 btc 代币账户是否存在，如果不存在则一定要先领水，然后创建代币账户，再 mint 代币
    const { value } = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { programId: TOKEN_PROGRAM_ID })
    
    const mintList = value.map((account: any) => account.account.data.parsed.info.mint)
    let needCreateAccount = false
    // 没有创建代币账户时，一定要创建并领水
    if (!mintList.includes(USDC_MINT.toBase58()) || !mintList.includes(BTC_MINT.toBase58())) {
        needCreateAccount = true
        needFaucet = true
    }

    // 领水，用来做油费
    if (needFaucet) {
        await faucet(keypair)
    } 
    const ataList = []
    if (needCreateAccount) {
        // 创建代币账户需要 0.00004 sol, 如果资产不足则再领一次水
        if (balance < LAMPORTS_PER_SOL * 0.00002) {
            await faucet(keypair)
        }
        const createdAccounts = await createTokenAccounts(keypair, [USDC_MINT, BTC_MINT])
        ataList.push(...createdAccounts)
    } else {
        const usdcAccount = value.find((account: any) => account.account.data.parsed.info.mint == USDC_MINT.toBase58())!.pubkey
        const btcAccount = value.find((account: any) => account.account.data.parsed.info.mint == BTC_MINT.toBase58())!.pubkey
        ataList.push(usdcAccount)
        ataList.push(btcAccount)
    }

    // mint 代币，领水时固定只会领 10 usdc 和 0.00025 btc
    if (needFaucet) {
        const usdcMintInfo = TOKEN_INFO_DICT.USDC
        const btcMintInfo = TOKEN_INFO_DICT.BTC
        const tx = new Transaction().add(
            createMintToInstruction(
                USDC_MINT,
                ataList[0],
                invariantPayer.publicKey,
                usdcMintInfo.amount * Math.pow(10, usdcMintInfo.decimals),
                undefined,
                TOKEN_PROGRAM_ID
            ),
            createMintToInstruction(
                BTC_MINT,
                ataList[1],
                invariantPayer.publicKey,
                btcMintInfo.amount * Math.pow(10, btcMintInfo.decimals),
                undefined,
                TOKEN_PROGRAM_ID
            )
        )
        const sign = await sendAndConfirmTransaction(connection, tx, [keypair, invariantPayer])
        console.log(`${nowDateTimeString()} [invariant faucet] mint token success, target: ${keypair.publicKey.toBase58()}, sig: ${sign}`)
        // 等待 30s ~ 100s，区块确认，否则后面的 swap 可能会失败
        await sleepRandom(1000 * 30, 1000 * 100)
    }

}


async function task(index: number) {
    // 1. 先检查资产是否足够交互，足够则随机选择是否领水
    const keypair = new HDWallet(config.wallet.mnemonic, `m/44'/501'/${index}'/0`).keypair
    await faucetTask(keypair)
    // 2. swap 交互 TODO
}

async function runTask() {
    // 随机 30% ~ 90% 的账户交互
    const indexList = randomIndexList(config.wallet.invariantCount).splice(0, Math.floor(config.wallet.invariantCount * 100 / randomInt(30, 90)))
    console.log(`${nowDateTimeString()} [invariant] start task, total: ${indexList.length}, index: [${indexList}]`)
    const [start, end] = getSleepScope(indexList.length)
    for (const index of indexList) {
        try {
            await task(index)
        } catch (e) {
            console.error(`${nowDateTimeString()} [invariant] task error, wallet index: [${index}]`, e)
            continue
        }
        // 随机等待 2-10 分钟
        await sleepRandom(start, end)
    }
}

async function main() {
    if (config.wallet.mnemonic.split(' ').length < 12) {
        console.error('mnemonic is invalid, see config.toml')
        return
    }
    while (true) {
        runTask()
        // 随机等待 10 ~ 24 小时
        await sleepRandom(1000 * 60 * 60 * 10, 1000 * 60 * 60 * 24)
    }
}

main()