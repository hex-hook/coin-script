import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import config from '@/eclipse/config.toml'
import { HDWallet } from '@/util/solana'
import { randomElement, randomIndexList, randomInt } from '@/util/random'
import { nowDateTimeString, sleepRandom } from '@/util/time'
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddress } from '@solana/spl-token'
import { AnchorProvider, BN, Program, Wallet, web3, type Idl } from '@project-serum/anchor'
import InvariantIdl from '@/eclipse/invariant_idl.json'

interface TokenInfo {
    // 代币名称
    name: string
    // 代币 mint 地址
    mint: PublicKey
    // 代币小数位数
    decimals: number
    // 领水数量
    amount: number,
    // swap 是的基准，用做 swap 标的数量，需要拟人
    baseAmount: number
}

type SwapSymbol = 'BTC/USDC' | 'BTC/MOON' | 'MOON/USDC' | 'MOON/BTC' | 'USDC/BTC' | 'USDC/MOON';
interface SwapPool {
    // 交易对
    symbol: SwapSymbol
    // 方向，调用智能合约时的参数，与交易对绑定
    x2y: boolean
    // 用来获取 pda 的参数
    fee: BN
    tickSpacing: number
    limit: BN
    // 本次升级新增的智能合约参数
    accounts: string[]
}


// invariant 站点空投账户源码 https://github.com/invariant-labs/webapp/blob/master/src/store/consts/airdropAdmin.ts
const invariantPayer = Keypair.fromSecretKey(Buffer.from([
    85, 51, 81, 126, 224, 250, 233, 174, 133, 40, 112, 237, 109, 244, 6, 62, 193, 121, 239, 246, 11,
    77, 215, 9, 0, 18, 83, 91, 115, 65, 112, 238, 60, 148, 118, 6, 224, 47, 54, 140, 167, 188, 182,
    74, 237, 183, 242, 77, 129, 107, 155, 20, 229, 130, 251, 93, 168, 162, 156, 15, 152, 163, 229, 119
]))

const USDC_MINT = new PublicKey('5gFSyxjNsuQsZKn9g5L9Ky3cSUvJ6YXqWVuPzmSi8Trx');
const BTC_MINT = new PublicKey('2F5TprcNBqj2hXVr9oTssabKdf8Zbsf9xStqWjPm8yLo');
const MOON_MINT = new PublicKey('JChWwuoqpXZZn6WjSCssjaozj4u65qNgvGFsV6eJ2g8S')


type TokenName = 'USDC' | 'BTC' | 'MOON';
const SWAP_PROGRAM_ID = 'CsT21LCRqBfh4SCcNZXtWjRZ6xvYKvdpEBaytCVmWnVJ'
const POOL_SEED = new TextEncoder().encode('poolv1')

// token 信息
const TOKEN_INFO_DICT: Record<TokenName, TokenInfo> = {
    USDC: { name: 'USDC', mint: USDC_MINT, decimals: 9, amount: 10, baseAmount: 1 },
    BTC: { name: 'BTC', mint: BTC_MINT, decimals: 9, amount: 0.00025, baseAmount: 0.00005 },
    MOON: { name: 'MOON', mint: MOON_MINT, decimals: 5, amount: 0, baseAmount: 100},
}

// invariant 站点 swap 程序固定的值
const SWAP_INFO = {
    tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    state: new PublicKey('87MWoaqLvygKAFJKwoEcGVCCMq3bzSDeoqxd9vuD3zfp'),
    programAuthority: new PublicKey('DDw4yQXdEUN14ENrgpHxjtv6tZopt3DBnWEEggmhTxRB'),
}

// 需要改成动态获取，否则会报 6007，找不到 tick
const SWAP_POOL: SwapPool[] = [
    {
        symbol: 'BTC/USDC',
        x2y: true,
        // 下面四个值是配套的，改的时候要一起改
        fee: new BN(10000000000),
        tickSpacing: 100,
        limit: new BN(10).pow(new BN(26)),
        accounts: ['9KqPLVwG6CQQtdqbdDeaeJQqcYNpJYwXswiCNPmTB7QW', '7PuxpLk663pBTwpPpVcaAgSi1AiqV3ckfpQKTvjz8w6q', '7cL4LPxjP1adzYJMmf2B4tomk7WHBkiqg6BmKEikSUE2', 'D952eCaLcxjhbDJui1Z8TwhqxLqWEFeDPJVrdZzstkaK', 'Aw89kZzykeGs3eQY8A1EZasx4ZV5KNioYybiu74yUXFK', '4UWVNXcv3jtyVRSe6XZjR1RdPBCqxRSCE2CVN69i2PmC', 'FgThNkWiyi53vaB8PwtSsyAr4UufMEZDkBByhMQaHcEn', 'F3mBGJmRfTmbDCyf6Pv2MxxzhfCgAzg255CJisiK7KBG', '2grLNWF9CS9UEYkCbyfHEFHN1YQGFm4HnKZY2RQbEtvR', 'yVMdj4NP4mHxGoYUWbVzmXGvLSNQuKeDwn6EKAhKpo5', '7pjgRJAYukzcpEwiURcHDwaMSbD72yBd9nCciwh9N3yu', 'DnaVuLDfXpMLHwmnCA5MoESHBkZ8qXvHZKiQguFgA4ab', 'Fnx9tKiT2Si7G9AjKo9FWkbdyTes67jgbbgqA8NhCAee', '6FaqmskHxJjBeUtGWfYAvMHb1mfR2fJrqLfNTpgat5ag', 'Hy7XLduNs7GbaDUYrr8MZMaVvEnKpbAMeERBFyAJh6GA', '4cQsnk9d7Lg5FCgpUkZcDioo1bJPcynmcBP16jUZ2S4V', '6DfNsQqV4U2nz8yFmnJTupwDCVhNeLa4cStJiBG8iPWe', '56L6bEcwXaxCeHqXuBozop5QTrChResqeDvg7PXi4wnu', 'CuHiPedYfmdrjQEuXM1M4QVvMgroKAqvWDDChkRv7DWw', '3pVZM7ieHBt74EKsF13JhewaCVXdD4VU8S5dSRGg9tYF'],
    },
    {
        symbol: 'USDC/BTC',
        x2y: false,
        // 500000000 5, 200000000 5
        fee: new BN(200000000),
        tickSpacing: 5,
        limit: new BN(10).pow(new BN(28)),
        accounts: ['3pVZM7ieHBt74EKsF13JhewaCVXdD4VU8S5dSRGg9tYF', '9W3vQkXHk9BZNYL7MjGfyEF4kPaLiFbbiSnC9Gj4V1jn', '5amThMaabEoauxHFA4XGSCeNqpVEwdQM6khWTapMu9p1', '5NgUy9ZW63Jionue6PBFKiEnebdHVTU6zFYLHXps7C75', 'pvYGgSoCan8Mn12pA5DxDrJsKjwa13y7BB5pomUW83o', 'QKCTx1dPPW54WbTWkkcSjfugT7fRXU6BQNEkr8riB1J', '4bmAyzBVoC5xRz4QCNbWzeqdwQoZ5nBFnwcdqrWBgr22', 'AY3reikEFWmZmfKa3cXgod9nYog9c4eHLCJmtWtxMDEy', '7uhnaQCK51mEgZMtRzjYspPPZZWbqgQwk4FSUa789ZMa', '3bLzR9rt6QRFzw7gxGaCwgmZzwk6QqDrvXzqY5kbCnrj', 'F8phj4fohkG8CFTySzsEi5q3xzEt2QwKtCS2hr7BLzyA', 'BiiwYyTUn1N8MSRT5tVYeWa2Wr6B334KsCe9z9eTnHYt', 'EYBkW3yJVTF95LH1eTYLbbDY9WdQ8UBmNZjjM9thKf2d', 'APb9vvijV5fw7Wj98uuHyWWCj6FZ9McfMipYCwj2Avoz', '4u5GPSXnCThJeGxDR1BjEovUpq47KDEZrUvDxSsv4Byg', '9y2DJmbwbyY1QUV712LhFJFFRHZwUy3hWAUsTmfn4Ymj', '9vNk7oTMKE7oorszqmfHDh4MsxTtA4PjfmiFai7RHHAn', 'EebuVHv5ACVjRgCgiqDoUCfdFCZMjfaj4geHvAxMHTJJ', '4f2hbN2npDLG3PUw8oFYT7ywuCE6Zit1Yo2Xnf8hvfae', 'CuHiPedYfmdrjQEuXM1M4QVvMgroKAqvWDDChkRv7DWw']
    },
    {
        symbol: 'BTC/MOON',
        x2y: true,
        // 500000000 5
        fee: new BN(500000000),
        tickSpacing: 5,
        limit: new BN(10).pow(new BN(24)),
        accounts: ['4LVc9Yw9d5ZjVzwum9E3D8htzeYKiYiKzr3Pd46xDfeJ', '48mSaxxAxqZv4UcT8hkDPHmZdpL8hqzahfze1PSZPHtR', 'GZwBF7HDdJqtz3te9N9Ukt9xRx9TXbgL61DRn6hUX4av', '2fmcUAk51vXy3RzHRKeuwi6a4Bdgqziwrw5z6NHjkV5t', 'FcmkDL7gJvAbung9j6QyHb9oHVTdVSYDzmGdP7gadnBv', '9YWNsTvh9Wp7kmx3WDQ5e7geRWyCiP32uUBn2D1L2NE3', 'CWk7iwRSYEt7pEZbVXCHSibY5yQYqZDsnWdeyB7fENLx', '7dCgeZ7YnUbf4NkUQHQNxxPLvC6yoGo2MiuQhir9GZae', '5esPCnbqKiiPjYo2254Hx7gR7h7Gqs6xY3PC6TejNWfU', 'FMqr5y6eC9BnMGiyd1DeUrFScMKuK79HFu48hydrxgkD', 'F1QXMRUPbuwvoAFMww57eSAJKNpCjfVh3AL8vTBMW2yy', '6VZvfSEpbg6hc7WVPTsQRTjXnunewrbia4vEoHWiNvL6', '4foKSC6uNZ7CZPgCjRu2QYqdwT9KGWj9eqYGTNozk37h', 'HeYrxd9Bev5ptJS7U1Fn3bxENa2d8CTmxH9juctv6FPw', 'AsJFjnzQGAADzwW63XoXT3pxcRVdoixRe8R8bVL1F3ot', 'GNCqtKQHgiP5D9xYVwhQY38tBSfDTfqdmrUr7WSoM99j', '4eDwyxcFvjnM6rxyj5pBD8sHJmNGQbMZtdvfd5Uh7tse', '5zb6Aybn897orxri9mFxVUaRTu2BiDQsfyuFQKcQPBQ9', '3sjmz7Uh1FNQBFoxgrhEywgtk1RYBD9kgSqg6ju6Q43x', 'G97MFqKo6f1dBWmeQW3kyBCCb5Sspzy4jUt9xM4ccKBu'],
    },
    {
        symbol: 'MOON/BTC',
        x2y: false,
        // 200000000/5, 100000000/1
        fee: new BN(200000000),
        tickSpacing: 5,
        limit: new BN(10).pow(new BN(27)),
        accounts: ['26tgBMzAREyHpwZ9hFZaanUTqLS9gmUJGuoxbWJaL9UU', '6e3ob1zLKsRGyFoDUk4XYDbnCtyUXPMYbRnnayLXjKLR', '4Nhu2gwhxYqqh1jiKpseAjkvctB473TfmLEqL5MUTGtw', '9NgTw26SpC737UNwHW2VmiygPQdwcFpd6SgLJJ8vDsST', 'ANZ4fy59norzvKEchbkxaNAyHYmhkxcCT6W61WLwLzJc', 'GdfckozbCfDp3jdmTtyS7Tnvo6prdeftHpaWbFkRKWuh'],
    },

    {
        symbol: 'MOON/USDC',
        x2y: false,
        // 500000000/5
        fee: new BN(1000000000),
        tickSpacing: 10,
        limit: new BN(10).pow(new BN(25)),
        accounts: ['AgnFhAxJk2vPoWJfH6w5nvWEHAXa74CHKM5UiDKrnfnD', 'HgLP5kx5R4kH33piD1fJuh11EVtBgxdBNrTgptaZsgkF', 'HP3BmjuXrEffmWUGbYbcyY6dBGaanLYB3Z5H1mM4gZJx', 'D2wzor3Fs6zJp6MxZERFfXLRhXbZsuvKA7ZsXPtodTBb', 'FMqKzP6A6D9eE1QmbyHmkUzLsKKSYEi2aBEYYGrZ9hyc', 'AXtBS7zNx7beHeLxVA9UxZjLZ8LubHumsZrVQAuLqsFj', '2CMCdjmXJLSdMrdfyTZWPHV24rhi4YUvxcSrFkxvA8qB', '6gwZ2ZX3QRAaSk3pzg435teYHRGoiZUv4U9Bsi8kkR1D', 'JDHQGTmYD9p7PBg79uWUMt24bi1qrRFTVb1N2fUxLE6D', '4n6omw25GgNz7WwXmuDMDuNF4HFB4y6uhYVwtA5DUzx2', '8nprhtjMa6B5eKbAcxCPj1zNT7vrBVxx7wpppmT5JZBV', 'FjKVo2YgGNF1U6ZBJSYscb6VBq6wR2Kr36VHHQdc3tX', '2MVdJh9Nui7WH8fZxnwso4LZSnziRomu8j2asyPuaQcH', '55HTaAeaaiazYaYAt4Ex43XknWSiQXtaMjbBuff4DK4r', '8B2WXCf2BoifryFMMzzVAQA7ZdiYM1R2KZJydTUP17A4', 'EjJQzjbFNmSHEjGQXhLcLjLCkdqEVhHfkLHmkjLZgHR9', 'CtzzG3QHwo4SybGgaBfNVQjcVkigWkTZgbqjRn9DkwfM', 'EahxvcCaGDS2cwCdehtQPc4FfNVkibkq3mfCHZ9zQHn3', '4DDLSNFgiKSwiNC1cTmiwZvMuveGVMZB8mb5jzT6Tdny', '5WEU9LKTbdAc7mSTCpceK4kKVXRY68zjhpTkJjtiQ6b'],
    },
    {
        symbol: 'USDC/MOON',
        x2y: true,
        // 有时候是 1000000000/10 有时候是 200000000/5
        fee: new BN(1000000000),
        tickSpacing: 10,
        limit: new BN(10).pow(new BN(23)),
        accounts: ['BwkiMCtNwQQuRW4RtjthijzKqc1zJ8nnm7oRXWaYGkzn', '3GhVxcvGkKMfdpWd9mpBtgqn8zrgqRZLfL1n1yav3cD5', '3EJDThLbxfyV5Vqm5LJCfXpqsDUm7j1C2AoWokcTqsVX', '8e544GS9NfcrLr4LWsgz52SmSniBYpYKbRLKa4uAvERc', '7JGqC4bxNYh9baszHaMAtjywuquC8e4BZ5RGP7oW5EPZ', '4QoED1uAAXafPU6xZNAsav7dtqL3tZkWLkMQYCsZTCVh', '3Pok3w59AYsFbadEsdz32NF89ADUhao7C2qBPXzdqpo7', '7QPw1Ppp6Vx8wcKcUyeiSSn1LxH47Qv4DpYrzXs5VrJh', 'AfHUcHf2vnXEkWy51xvaHL2P57Wdz8UpsA4iK7zHWK6B', '6w3q3h4XxWYDXGJv899VzXSgSPiJRfMMGJMqhyPF8Hdh', '3zYrXs3cyfdaRpBouMGaYAi2nG4DhSmNNjDKKCKnHqxo', 'BUH4mbxrDBH3dCitxsq281CBjZKkVZrGpuCNP4nGFCJz', '3VqNAiCYF2cdXGMhd1LaoDrVmdf9KAedKLhobnTYQKaE', '94Lpg5BvQsPgkQuY6eM1vJ1C5HVPDkpM2ivs7TKBaPxZ', '8N5VLqH7AtTUogVdDGX55x9tu4vFLabNVD2KqKfPVXkK', 'AT5cUaCbBPAafY3XqShqH5JwTYnfJCLW4GNr7u68BTKo', '5P2MDBeNJvduXVNYtEJrRdf8Q1VBuBg2xydDTTBbZtaM', 'D9eETjYzKdu1mik63awZzZs3YwLy3vUKeEqYCCjhG8N8', 'FoahLUmXPXHDCgLhSfFCMHRj3gW5AW9PJutF49h5Mgmm', 'A3VxFxbwbHS4DqHYaXKyasQmjzF2qf4wWBV1XVkj9RVo'],
    },
]


/**
 * 领水 sol
 * @param keypair 密钥对
 */
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
    await sleepRandom(1000 * 10, 1000 * 20)
}

/**
 * 创建用于领水的代币账户
 * 固定的是 usdc 和 btc 代币
 * @param keypair 密钥对
 * @returns 
 */
async function createFaucetTokenAccounts(keypair: Keypair): Promise<PublicKey[]> {
    const ataList: PublicKey[] = []
    const tx = new Transaction()
    for (const mint of [USDC_MINT, BTC_MINT]) {
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
    const sign = await sendAndConfirmTransaction(new Connection(config.eclipse.rpc, 'finalized'), tx, [keypair])
    console.log(`${nowDateTimeString()} [invariant faucet] create associated token account success, target: ${keypair.publicKey.toBase58()}, sig: ${sign}`)
    await sleepRandom(1000 * 15, 1000 * 30)
    return ataList
}

/**
 * 领水
 * 1. 本币和代币一定一起领，否则行为与站点不一致
 * 2. 领水时，如果代币账户不存在，则创建代币账户
 * @param keypair 密钥对
 * @param force 是否强制领水
 */
async function faucetTask(keypair: Keypair, force: boolean = false) {
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

    if (force) {
        needFaucet = true
    }

    // 领水，用来做油费
    if (needFaucet) {
        await faucet(keypair)
    }
    const ataList = []
    if (needCreateAccount) {
        // 创建两个代币账户需要 0.00004+ sol, 如果资产不足则再领一次水
        if (balance < LAMPORTS_PER_SOL * 0.000025) {
            await faucet(keypair)
        }
        const createdAccounts = await createFaucetTokenAccounts(keypair)
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
        await sleepRandom(1000 * 10, 1000 * 20)
    }

}

/**
 * 获取或创建用于交易的代币账户
 * @param keypair 密钥对
 * @param mintList 交易的代币 mint
 * @returns [xPublic, yPublic, xAmount, yAmount] [x 代币账户地址, y 代币账户地址, x 代币数量, y 代币数量]
 */
async function getOrCreateTradeTokenAccounts(keypair: Keypair, mintList: [PublicKey, PublicKey]): Promise<[PublicKey, PublicKey, number]> {
    // 检查代币账户是否存在，不存在则创建
    const connection = new Connection(config.eclipse.rpc, 'confirmed')
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { programId: TOKEN_PROGRAM_ID })
    const fromMintAddress = mintList[0].toBase58()
    const toMintAddress = mintList[1].toBase58()
    let fromTokenAccount = tokenAccounts.value.find((item: any) => item.account.data.parsed.info.mint == fromMintAddress)
    let toTokenAccount = tokenAccounts.value.find((item: any) => item.account.data.parsed.info.mint == toMintAddress)
    let fromTokenAccountPubkey = fromTokenAccount?.pubkey
    let toTokenAccountPubkey = toTokenAccount?.pubkey
    // 已经存在不用创建
    if (fromTokenAccount && toTokenAccount) {
        return [
            fromTokenAccount.pubkey, 
            toTokenAccount.pubkey,
            fromTokenAccount.account.data.parsed.info.tokenAmount.uiAmount,
        ]
    }
    // 未创建则创建
    const tx = new Transaction()
    let count = 0
    if (!fromTokenAccountPubkey) {
        fromTokenAccountPubkey = await getAssociatedTokenAddress(mintList[0], keypair.publicKey, undefined, TOKEN_PROGRAM_ID)
        count++
        tx.add(
            createAssociatedTokenAccountInstruction(
                keypair.publicKey,
                fromTokenAccountPubkey,
                keypair.publicKey,
                mintList[0],
                TOKEN_PROGRAM_ID
            )
        )
    }
    if (!toTokenAccountPubkey) {
        toTokenAccountPubkey = await getAssociatedTokenAddress(mintList[1], keypair.publicKey, undefined, TOKEN_PROGRAM_ID)
        count++
        tx.add(
            createAssociatedTokenAccountInstruction(
                keypair.publicKey,
                toTokenAccountPubkey,
                keypair.publicKey,
                mintList[1],
                TOKEN_PROGRAM_ID
            )
        )
    }
    const balance = await connection.getBalance(keypair.publicKey)
    // 创建单个代币账户需要 0.00002 sol 左右，冗余一些，避免失败
    if (balance < LAMPORTS_PER_SOL * 0.000025 * count) {
        console.log(`${nowDateTimeString()} [invariant swap] balance [${balance} < ${LAMPORTS_PER_SOL * 0.000025 * count}], need faucet`)
        await faucetTask(keypair, true)
    }
    console.log(`${nowDateTimeString()} [invariant swap] account [${keypair.publicKey.toBase58()}] create [${count}] associated token account, from: ${fromTokenAccountPubkey.toBase58()}, to: ${toTokenAccountPubkey.toBase58()}`)
    const sign = await sendAndConfirmTransaction(connection, tx, [keypair])
    console.log(`${nowDateTimeString()} [invariant swap] create associated token account success, target: ${keypair.publicKey.toBase58()}, sig: ${sign}`)
    await sleepRandom(1000 * 10, 1000 * 20)
    return [fromTokenAccountPubkey, toTokenAccountPubkey, 0]
}

const bigNumberToBuffer = (n: BN, size: 16 | 32 | 64 | 128 | 256) => {
  const chunk = new BN(2).pow(new BN(16))

  const buffer = Buffer.alloc(size / 8)
  let offset = 0

  while (n.gt(new BN(0))) {
    buffer.writeUInt16LE(n.mod(chunk).toNumber(), offset)
    n = n.div(chunk)
    offset += 2
  }

  return buffer
}

/**
 * 获取 pool 地址
 * @param from mint 账户
 * @param to mint 账户
 * @param fee 固定参数
 * @param tickSpacing 固定参数
 * @returns 
 */
function getPoolAddress(from: PublicKey, to: PublicKey, fee: BN, tickSpacing: number): PublicKey {
    
    const [ pubkey, _ ] = PublicKey.findProgramAddressSync(
        [
            POOL_SEED,
            from.toBuffer(),
            to.toBuffer(),
            bigNumberToBuffer(fee, 128),
            bigNumberToBuffer(new BN(tickSpacing), 16)
        ],
        new PublicKey(SWAP_PROGRAM_ID)
    )
    return pubkey
}

/**
 * swap 交互
 * @param index 钱包索引
 * @returns 
 */
async function swap(index: number) {
    const keypair = new HDWallet(config.wallet.mnemonic, `m/44'/501'/${index}'/0`).keypair
    const connection = new Connection(config.eclipse.rpc, 'confirmed')
    const balance = await connection.getBalance(keypair.publicKey)
    if (balance < LAMPORTS_PER_SOL * 1e-7) {
        // 强制领水
        await faucetTask(keypair, true)
    }
    const pool = randomElement(SWAP_POOL)
    const symbol = pool.symbol
    const [fromSymbol, toSymbol] = symbol.split('/') as [TokenName, TokenName]
    console.log(`${nowDateTimeString()} [invariant swap] account [${keypair.publicKey.toBase58()}] swap ${fromSymbol} to ${toSymbol}`)
    const fromTokenInfo = TOKEN_INFO_DICT[fromSymbol]
    const toTokenInfo = TOKEN_INFO_DICT[toSymbol]
    const [fromAccount, toAccount, xAmount] = await getOrCreateTradeTokenAccounts(keypair, [fromTokenInfo.mint, toTokenInfo.mint])
   
    // swap 代币的基数，swap 的是基数的 n 倍
    const baseAmount = fromTokenInfo.baseAmount
    // 当前代币资产
    const tokenBalance = xAmount
    // 代币资产小于基准时不交易
    if (tokenBalance < baseAmount) {
        console.warn(`${nowDateTimeString()} [invariant swap] account [${keypair.publicKey.toBase58()}] ${fromSymbol} amount [${tokenBalance}] < base amount [${baseAmount}], skip swap`)
        return
    }

    // 数量为基准的 n 倍
    let n = randomInt(1, Math.floor(tokenBalance / baseAmount))

    const decimal = new BN(fromTokenInfo.decimals)
    // 修正基准，避免精度问题，太大也不行
    const fixBaseAmount = 100000
    const amountBN = new BN(10).pow(decimal).muln(n).muln(baseAmount * fixBaseAmount).divn(fixBaseAmount)
    console.log(`${nowDateTimeString()} [invariant swap] account [${keypair.publicKey.toBase58()}] swap ${fromSymbol} to ${toSymbol}\n current token balance: ${tokenBalance}, swap amount: ${baseAmount * n}`)

    const provider = new AnchorProvider(connection, new Wallet(keypair), { preflightCommitment: 'recent' })
    const programId = new web3.PublicKey(SWAP_PROGRAM_ID)
    const program = new Program(InvariantIdl as Idl, programId, provider)
    const poolAddress = pool.x2y ? getPoolAddress(fromTokenInfo.mint, toTokenInfo.mint, pool.fee, pool.tickSpacing) : getPoolAddress(toTokenInfo.mint, fromTokenInfo.mint, pool.fee, pool.tickSpacing)
    const { tickmap, tokenXReserve, tokenYReserve} = (await program.account.pool.fetch(poolAddress))
    const remainingAccounts = pool.accounts.map((address) => ({pubkey: new PublicKey(address), isWritable: true, isSigner: false}))
    const [accountX, accountY] = pool.x2y ? [fromAccount, toAccount] : [toAccount, fromAccount]
    const tx = new Transaction().add(
        // 这里写死
        ComputeBudgetProgram.setComputeUnitLimit({units: 1_400_000}),
        program.instruction.swap(pool.x2y, amountBN, true, pool.limit, {
            accounts: {
                // 交易的代币账户
                accountX,
                accountY,

                owner: keypair.publicKey.toBase58(),

                // 固定值
                tokenProgram: TOKEN_PROGRAM_ID,
                state: SWAP_INFO.state,
                programAuthority: SWAP_INFO.programAuthority,

                // 交易的池子
                pool: poolAddress,
                tickmap: tickmap as PublicKey,
                reserveX: tokenXReserve as PublicKey,
                reserveY: tokenYReserve as PublicKey,
            },
            remainingAccounts, 
        })
    )
    // 这里偶尔还是会失败，暂未找到原因
    const sign = await sendAndConfirmTransaction(connection, tx, [keypair])
    console.log(`${nowDateTimeString()} [invariant swap] account [${keypair.publicKey.toBase58()}] swap success, sign: ${sign}`)
}

/**
 * invariant 站点交互任务
 * @param index 钱包索引
 */
async function task(index: number) {
    // 1. 先检查资产是否足够交互，足够则随机选择是否领水
    const keypair = new HDWallet(config.wallet.mnemonic, `m/44'/501'/${index}'/0`).keypair
    await faucetTask(keypair)
    // 2. swap 交互，随机 1~5 次
    const count = randomInt(1, 5)
    for (let i = 0; i < count; i++) {
        await swap(index)
        // 随机等待 30s ~ 60s
        await sleepRandom(1000 * 10, 1000 * 30)
    }
}

/**
 * 批量执行任务（串行）
 * 1. 单机不建议并行，rpc 节点性能不太行
 * 2. 配置的交互的钱包数量可以大一些，避免钱包之间间隔过长
 */
async function runTask() {
    // 随机 30% ~ 90% 的账户交互
    const indexList = randomIndexList(config.wallet.invariantCount).splice(0, Math.floor(config.wallet.invariantCount * 100 / randomInt(30, 90)))
    console.log(`${nowDateTimeString()} [invariant] start task, total: ${indexList.length}, index: [${indexList}]`)
    for (const index of indexList) {
        try {
            await task(index)
        } catch (e) {
            console.error(`${nowDateTimeString()} [invariant] task error, wallet index: [${index}]`, e)
            continue
        }
        await sleepRandom(1000 * 5, 1000 * 10)
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