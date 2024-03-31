import { Account, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import config from './config.toml'
import { HDWallet } from '../util/solana'
import { randomIndexList } from '../util/random'
import { nowDateTimeString, sleepRandom } from '../util/time'
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createMint, createMintToInstruction, getAssociatedTokenAddress, mintTo } from '@solana/spl-token'
const { Connection } = require('@solana/web3.js')

interface FaucetInfo {
    name: string
    mint: PublicKey
    decimals: number
    amount: number
}

// invariant 站点空投账户源码 https://github.com/invariant-labs/webapp/blob/master/src/store/consts/airdropAdmin.ts
const invariantPayer = Keypair.fromSecretKey(Buffer.from([
    85, 51, 81, 126, 224, 250, 233, 174, 133, 40, 112, 237, 109, 244, 6, 62, 193, 121, 239, 246, 11,
    77, 215, 9, 0, 18, 83, 91, 115, 65, 112, 238, 60, 148, 118, 6, 224, 47, 54, 140, 167, 188, 182,
    74, 237, 183, 242, 77, 129, 107, 155, 20, 229, 130, 251, 93, 168, 162, 156, 15, 152, 163, 229, 119
]))

// 不要随意调整金额，避免被判断为女巫
const FAUCET_INFO_LIST: FaucetInfo[] = [
    {name: 'USDC', mint: new PublicKey('5yQMGqpB1Q1J3b8UNStkVks9nFKao1axKYsgZYeMv1ei'), decimals: 9, amount: 10},
    {name: 'BTC', mint: new PublicKey('97hEP4PZ2P1pQ77yCvc9NxARHttVuTVhdKmvGG1aRNGG'), decimals: 9, amount: 0.00025},
    {name: 'ETH', mint: new PublicKey('F1UrAegXK6EWMh1Qprmj5ACKLCKjRkYnAWVeUr6dpAf7'), decimals: 9, amount: 0.003},
]


/**
 * 领水
 * @param index 钱包索引
 */
async function faucetTask(index: number) {
    const connection = new Connection(config.eclipse.rpc)
    const mnemonic = config.wallet.mnemonic
    // 固定金额，避免被判断为女巫，调太大了官方可能会换钱包，不要把钱包的钱转走！
    const lamportsToSend = LAMPORTS_PER_SOL * 0.00003;
    const target = new HDWallet(mnemonic, `m/44'/501'/${index}'/0`).keypair.publicKey
    const transferTransaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: invariantPayer.publicKey,
            toPubkey: target,
            lamports: lamportsToSend,
        })
    );

    await sendAndConfirmTransaction(connection, transferTransaction, [
        invariantPayer,
    ]);
    console.log(`${nowDateTimeString()} [invariant faucet] faucet success, wallet index: [${index}], target: ${target.toBase58()}`)
}


/**
 * 检查并创建 token 账户
 * @param index 钱包索引
 * @returns 
 */
async function checkAndCreateTokenAccount(index: number): Promise<PublicKey[]> {
    const keypair = new HDWallet(config.wallet.mnemonic, `m/44'/501'/${index}'/0`).keypair
    const connection = new Connection(config.eclipse.rpc)
    const { value } = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { programId: TOKEN_PROGRAM_ID })
    const needCreateAccounts = []
    if (value === null || value.length === 0) {
        console.log(`${nowDateTimeString()} [invariant faucet] create token account, wallet index: [${index}] [${keypair.publicKey.toBase58()}]`)
        needCreateAccounts.push(...FAUCET_INFO_LIST)
    } else {
        const mintList = value.map((account: any) => account.account.data.parsed.info.mint)
        // 已经创建了就不再创建
        const res = FAUCET_INFO_LIST.filter((info) => !mintList.includes(info.mint.toBase58()))
        if (res.length == 0) {
            console.log(`${nowDateTimeString()} [invariant faucet] token account exists, wallet index: [${index}]`)
            // 顺序不能变
            return FAUCET_INFO_LIST.map(item => value.find((account: any) => account.account.data.parsed.info.mint == item.mint.toBase58()).pubkey)
        }
        needCreateAccounts.push(...res)
    }
    const ataList = []
    const tx = new Transaction()
    for (const info of needCreateAccounts) {
        const ata = await getAssociatedTokenAddress(info.mint, keypair.publicKey, undefined, TOKEN_PROGRAM_ID)
        ataList.push(ata)
        tx.add(
            createAssociatedTokenAccountInstruction(
                keypair.publicKey,
                ata,
                keypair.publicKey,
                info.mint,
                TOKEN_PROGRAM_ID
            )
        )
    }
    // 这里用自己的账户创建并签名
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair])
    console.log(`${nowDateTimeString()} [invariant faucet] create token account success, wallet index: [${index}], sig: ${sig}`)
    console.log(`create token account: ${ataList.map((ata) => ata.toBase58())}`)
    // 创建成功等待 2 ~ 5 分钟再领水
    await sleepRandom(1000 * 60 * 2, 1000 * 60 * 5)
    return ataList
}

async function mintToken(index: number) {
    const ataList = await checkAndCreateTokenAccount(index)
    if (ataList.length != FAUCET_INFO_LIST.length) {
        console.error(`${nowDateTimeString()} [invariant faucet] mint token error, token account failed wallet index: [${index}]`)
        return
    }
    const keypair = new HDWallet(config.wallet.mnemonic, `m/44'/501'/${index}'/0`).keypair
    console.log(`${nowDateTimeString()} [invariant faucet] mint token, wallet index: [${index}] [${keypair.publicKey.toBase58()}]`)
    const connection = new Connection(config.eclipse.rpc)
    const tx = new Transaction()
    for (let i = 0; i < FAUCET_INFO_LIST.length; i++) {
        const mintInfo = FAUCET_INFO_LIST[i]
        const ata = ataList[i]
        tx.add(
            createMintToInstruction(
                mintInfo.mint,
                ata,
                invariantPayer.publicKey,
                mintInfo.amount * Math.pow(10, mintInfo.decimals),
                undefined,
                TOKEN_PROGRAM_ID
            )
        )
    }
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair, invariantPayer])
    console.log(`${nowDateTimeString()} [invariant faucet] mint token success, wallet index: [${index}] [${keypair.publicKey.toBase58()}], sig: ${sig}`)
}

async function runTokenFaucetTask() {
    const indexList = randomIndexList(config.wallet.count).splice(Math.floor(config.wallet.count / 2))
    console.log(`${nowDateTimeString()} [invariant token faucet] start task, total: ${indexList.length}, index: [${indexList}]`)
    for (const index of indexList) {
        try {
            await mintToken(index)
        } catch (e) {
            console.error(`${nowDateTimeString()} [invariant token faucet] task error, wallet index: [${index}]`, e)
        }
        // 随机等待 2-60 分钟
        await sleepRandom(1000 * 60 * 2, 1000 * 60 * 60)
    }
}


async function runFaucetTask() {
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
            await Promise.all([runFaucetTask(), runTokenFaucetTask()])
        } catch (e) {
            console.error(`${nowDateTimeString()} [invariant] main error`, e)
        }
        // 随机等待 10 ~ 24 小时
        await sleepRandom(1000 * 60 * 60 * 10, 1000 * 60 * 60 * 24)
    }
}

main()