import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import config from './config.toml'
import { HDWallet } from '../util/solana'
import { randomElement, randomIndexList, randomInt, shuffle } from '../util/random'
import { nowDateTimeString, sleepRandom } from '../util/time'
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddress } from '@solana/spl-token'
import { BN, Program, type Idl, web3, AnchorProvider, Wallet } from '@project-serum/anchor'
import InvariantIdl from './invariant_idl.json'

interface FaucetInfo {
    name: string
    mint: PublicKey
    decimals: number
    amount: number,
    randomAmounts: number[]
}

interface SwapPool {
    address: string
    tick: string
    reserveX: string
    reserveY: string
}

// invariant 站点空投账户源码 https://github.com/invariant-labs/webapp/blob/master/src/store/consts/airdropAdmin.ts
const invariantPayer = Keypair.fromSecretKey(Buffer.from([
    85, 51, 81, 126, 224, 250, 233, 174, 133, 40, 112, 237, 109, 244, 6, 62, 193, 121, 239, 246, 11,
    77, 215, 9, 0, 18, 83, 91, 115, 65, 112, 238, 60, 148, 118, 6, 224, 47, 54, 140, 167, 188, 182,
    74, 237, 183, 242, 77, 129, 107, 155, 20, 229, 130, 251, 93, 168, 162, 156, 15, 152, 163, 229, 119
]))

// 不要随意调整金额，避免被判断为女巫
const FAUCET_INFO_LIST: FaucetInfo[] = [
    {name: 'USDC', mint: new PublicKey('5yQMGqpB1Q1J3b8UNStkVks9nFKao1axKYsgZYeMv1ei'), decimals: 9, amount: 10, randomAmounts: [0.5, 1, 2, 3.5, 5, 8]},
    {name: 'BTC', mint: new PublicKey('97hEP4PZ2P1pQ77yCvc9NxARHttVuTVhdKmvGG1aRNGG'), decimals: 9, amount: 0.00025, randomAmounts: [0.0001, 0.0002, 0.00013, 0.00015, 0.00018, 0.00023]},
    {name: 'ETH', mint: new PublicKey('F1UrAegXK6EWMh1Qprmj5ACKLCKjRkYnAWVeUr6dpAf7'), decimals: 9, amount: 0.003, randomAmounts: [0.001, 0.002, 0.0013, 0.0015, 0.0017, 0.0022]},
]

// 调用 swap 智能合约时的价格限制，不同方向不同限制
// 如 USDC/BTC 的可以更少，BTC/USDC 的可以更多，具体需要根据行情计算，这里做了足够的冗余，除非行情涨幅过大(10x)，否则不会出现问题
const SWAP_PRICE_LIMIT: Record<string, BN> = {

    'USDC/BTC': new BN(10).pow(new BN(20)),
    'BTC/USDC': new BN(10).pow(new BN(22)),

    'USDC/ETH': new BN(10).pow(new BN(21)),
    'ETH/USDC': new BN(10).pow(new BN(23)),

    'BTC/ETH': new BN(10).pow(new BN(23)),
    'ETH/BTC': new BN(10).pow(new BN(26)),

}

// 调用智能合约固定参数， USDC/BTC 与 BTC/USDC 一样，与顺序无关
const SWAP_POOL_MAP: Record<string, SwapPool> = {
    'BTC/USDC': {
        address: '27Jnrgi5ZudApdrRBr8zGs25vcxmKqukDM7J89AyjXBX',
        tick: 'GrhduXmfxwcwVDJLBRdkc39QJU9WyNUdUz3xGecf48GN',
        reserveX: '3of2K5C8p8MfCJLo6db8uJiA8w22s3pkSXKM8aP9PXYG',
        reserveY: '29ZfHsu9yTpcxkqoaGZWZEyJVpjEf9rxe2Xgwh7qygvX',
    },

    'ETH/USDC': {
        address: 'EtUuqxumuHYWULtr5YJ3mUD5G6zjoPmMYZGXgU8b6zmT',
        tick: 'FpmPCHFgU7qinARV7JXS7viQGPwyu4yHBuR56gmybkYM',
        reserveX: 'EAxM8gK8xkc9nFmmDppfjjR1EnySKae9khhCM8DyfFWa',
        reserveY: '4B6ELKaUFWB2X6BSgi5xCKiEeUgct2tRYcgQdXknEA78',
    },
    'BTC/ETH': {
        address: 'GaRYqy2JwPCx9f42X98gvuCeG8aC7mcN1N1rykjjXate',
        tick: 'BaWcP1yX34Zjng4q1KCovct8UKke7FSxe1MH2nmxkxoF',
        reserveX: 'GoSMX8infddSX2ZiVRgxHXbNi8qjCyuyjNr8ZfN6dBQE',
        reserveY: 'A6WBZ6S9vny9UZnq6ebJbFuEahijVVA7RDqcukyMsWqg',
    },
}
// swap 智能合约程序账户地址
const SWAP_PROGRAM_ID = new PublicKey('7BdeqFrxwocwRonXtKWNYDaw95dQVb8UzBwgje5tW8KB')
// 固定参数
const SWAP_STATE_ADDRESS = '9FirKA3vAEcm4mMxExcRvNVA4aq2LT7SZzmPQ8QyXQGs'
// swap 智能合约作者地址
const SWAP_PROGRAM_AUTHORITY = 'Gq23SQPmXi1KB2pzxc5ezZdRqamswWcddEMx7vcAvcmv'


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

/**
 * 代币见的兑换
 * @param index 钱包索引
 * @returns 
 */
async function swap(index: number) {
    const keypair = new HDWallet(config.wallet.mnemonic, `m/44'/501'/${index}'/0`).keypair
    const connection = new Connection(config.eclipse.rpc)
    const [from, to] = shuffle(FAUCET_INFO_LIST).slice(0, 2)
  
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { programId: TOKEN_PROGRAM_ID })
    const mintAddressList = [from.mint.toBase58(), to.mint.toBase58()]
    // 筛选出 token 账户
    const filterTokenAccounts = tokenAccounts.value.filter(item => mintAddressList.includes(item.account.data.parsed.info.mint))
    const fromTokenAccount = filterTokenAccounts.find(item => item.account.data.parsed.info.mint == from.mint.toBase58())
    const toTokenAccount = filterTokenAccounts.find(item => item.account.data.parsed.info.mint == to.mint.toBase58())
    if (!fromTokenAccount || !toTokenAccount) {
        console.error(`${nowDateTimeString()} [invariant swap] token account not found, wallet index: [${index}]`)
        return
    }
    const amount = randomElement(from.randomAmounts)
    if (fromTokenAccount.account.data.parsed.info.tokenAmount.uiAmount < amount) {
        console.error(`${nowDateTimeString()} [invariant swap] token account balance not enough [${fromTokenAccount.account.data.parsed.info.tokenAmount.uiAmount} < ${amount}], wallet index: [${index}]`)
        return
    }
    const poolParams = SWAP_POOL_MAP[[from.name, to.name].sort().join('/')]
    if (!poolParams) {
        console.error(`${nowDateTimeString()} [invariant swap] pool not found, wallet index: [${index}]`)
        return
    }
    const provider = new AnchorProvider(connection, new Wallet(keypair), { preflightCommitment: 'recent' })
    const programId = new web3.PublicKey(SWAP_PROGRAM_ID)
    const program = new Program(InvariantIdl as Idl, programId, provider)
    // 方向 USDC -> BTC, ETH true，否则 false， BTC -> ETH true
    const xToY = [from.name, to.name].includes('USDC') ? from.name == 'USDC' : from.name == 'BTC'
    // 以 from 指定的 amount 为准，否则以 to 指定的 amount 为准，由于上面只对 from 的余额进行检查，这里写死
    const byAmountIn = true
    // 实际上是 amount * 10^decimals，需要使用 BN 封装
    const amountBN = new BN(amount * Math.pow(10, from.decimals))
    // TODO 还需要确定算法
    // 如果不是 xToY 则要调换地址
    const sqrtPriceLimit = SWAP_PRICE_LIMIT[`${from.name}/${to.name}`]
    if (sqrtPriceLimit === undefined) {
        throw new Error(`price limit not found, from: ${from.name}/${to.name}`)
    }
    const [xAccount, yAccount] = (xToY ? [fromTokenAccount, toTokenAccount] : [toTokenAccount, fromTokenAccount]).map(item => item.pubkey.toBase58())
    const tx = new Transaction().add(
        // 这里写死
        ComputeBudgetProgram.setComputeUnitLimit({units: 1_400_000}),
        // TODO 升级过时的属性
        program.instruction.swap(xToY, amountBN, byAmountIn, sqrtPriceLimit, {
            accounts: {
                accountX: xAccount,
                accountY: yAccount,
                owner: keypair.publicKey.toBase58(),
                tokenProgram: TOKEN_PROGRAM_ID,
                state: SWAP_STATE_ADDRESS,
                pool: poolParams.address,
                tickmap: poolParams.tick,
                reserveX: poolParams.reserveX,
                reserveY: poolParams.reserveY,
                programAuthority: SWAP_PROGRAM_AUTHORITY
            
            }
        })
    )
    await sendAndConfirmTransaction(connection, tx, [keypair])
    console.log(`${nowDateTimeString()} [invariant swap] swap success, wallet index: [${index}], from: ${from.name}, to: ${to.name}, amount: ${amount}`)
}

/**
 * 运行 token 领水任务，领 ETH, USDC, BTC
 */
async function runTokenFaucetTask() {
    const indexList = randomIndexList(config.wallet.count).splice(0, Math.floor(config.wallet.count * (randomInt(3, 10)/ 10)))
    console.log(`${nowDateTimeString()} [invariant token faucet] start task, total: ${indexList.length}, index: [${indexList}]`)
    for (const index of indexList) {
        try {
            await mintToken(index)
        } catch (e) {
            console.error(`${nowDateTimeString()} [invariant token faucet] task error, wallet index: [${index}]`, e)
            continue
        }
        // 随机等待 2-60 分钟
        await sleepRandom(1000 * 60 * 2, 1000 * 60 * 60)
    }
}

/**
 * 运行 SOL 领水任务
 */
async function runFaucetTask() {
    const indexList = randomIndexList(config.wallet.count).splice(0, Math.floor(config.wallet.count / (randomInt(3, 10)/ 10)))
    console.log(`${nowDateTimeString()} [invariant faucet] start task, total: ${indexList.length}, index: [${indexList}]`)
    for (const index of indexList) {
        try {
            await faucetTask(index)
        } catch (e) {
            console.error(`${nowDateTimeString()} [invariant faucet] task error, wallet index: [${index}]`, e)
            continue
        }
        // 随机等待 2-60 分钟
        await sleepRandom(1000 * 60 * 2, 1000 * 60 * 60)
    }
}

/**
 * 运行 swap 交互任务
 */
async function runSwapTask() {
    const indexList = randomIndexList(config.wallet.count).splice(0, Math.floor(config.wallet.count / (randomInt(3, 10)/ 10)))
    console.log(`${nowDateTimeString()} [invariant swap] start task, total: ${indexList.length}, index: [${indexList}]`)
    for (const index of indexList) {
        try {
            await swap(index)
        } catch (e) {
            console.error(`${nowDateTimeString()} [invariant swap] task error, wallet index: [${index}]`, e)
            continue
        }
        // 随机等待 2-10 分钟
        await sleepRandom(1000 * 60 * 2, 1000 * 60 * 10)
    }
}

async function main() {
    if (config.wallet.mnemonic.split(' ').length < 12) {
        console.error('mnemonic is invalid, see config.toml')
        return
    }
    while (true) {
        runFaucetTask();
        runTokenFaucetTask();
        runSwapTask();
       
        // 随机等待 10 ~ 24 小时
        await sleepRandom(1000 * 60 * 60 * 10, 1000 * 60 * 60 * 24)
    }
}

main()