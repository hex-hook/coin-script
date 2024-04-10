import config from './config.toml'
import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js'
import { HDWallet } from '../util/solana'
import { getSleepScope, nowDateTimeString, sleepRandom } from '../util/time'
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccount } from '@solana/spl-token'
import { randomIndexList, randomInt } from '../util/random'

const MINT_ACCOUNT = new PublicKey('FQYqdfYWkxvFAVNqoxtQkB2N9mdPE5Jbv9VwqBTWdpPv')
const MINT_AUTHORITY_ACCOUNT = new PublicKey('iNhzKvRYkgrtv3ejuLcrSR49rR1LL71x9SVPkjPNG1E')
const FAUCET_PROGRAM_ID = new PublicKey('7EtBBf3vKfP2m8mc6TwvQEKpBqfJgbH9VNhZ7kHeFTMP')
const FAUCET_DATA = Buffer.from('54afd39c38fa687600ca9a3b00000000', 'hex')



/**
 * 领取 USD
 * 首次会先创建代币账户
 * @param index 索引
 * @returns 
 */
async function faucet(index: number) {
    const keypair = new HDWallet(config.wallet.mnemonic, `m/44'/501'/${index}'/0`).keypair
    const connection = new Connection(config.eclipse.rpc)

    const balance = await connection.getBalance(keypair.publicKey)
    // 不够手续费了，下次再交互(创建代币账户或领 USD 的 sol 手续费)
    if (balance < LAMPORTS_PER_SOL * 1e-7) {
        console.warn(`${nowDateTimeString()} [${keypair.publicKey.toBase58()}] balance not enough: ${balance}`)
        return
    }
    
    const { value } = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { mint: MINT_ACCOUNT })
    let tokenAccount: PublicKey
    if (value.length === 0) {
        const ata = await createAssociatedTokenAccount(connection, keypair, MINT_ACCOUNT, keypair.publicKey)
        console.log(`${nowDateTimeString()} [${keypair.publicKey.toBase58()}] create token account [${ata.toBase58()}]`)
        // 等待 30s ~ 100s，否则领水时 token account 还没创建好
        await sleepRandom(30 * 1000, 100 * 1000)
        tokenAccount = ata
    } else {
        tokenAccount = value[0].pubkey
    }
    
    const tx = new Transaction().add(
        new TransactionInstruction({
            programId: FAUCET_PROGRAM_ID,
            keys: [
                {
                    isSigner: true,
                    isWritable: true,
                    pubkey: keypair.publicKey
                },
                {
                    isSigner: false,
                    isWritable: false,
                    pubkey: MINT_AUTHORITY_ACCOUNT
                },
                {
                    isSigner: false,
                    isWritable: true,
                    pubkey: MINT_ACCOUNT
                },
                {
                    isSigner: false,
                    isWritable: true,
                    pubkey: tokenAccount
                },
                {
                    isSigner: false,
                    isWritable: false,
                    pubkey: TOKEN_PROGRAM_ID
                }
            ],
            data: FAUCET_DATA
        }))
    const txHash = await sendAndConfirmTransaction(connection, tx, [keypair])
    console.log(`${nowDateTimeString()} [${keypair.publicKey.toBase58()}] faucet tx hash: ${txHash}`)
}

/**
 * 运行 USD 领水任务
 */
async function runFaucetTask() {
    const indexList = randomIndexList(config.wallet.invariantCount).splice(0, Math.floor(config.wallet.invariantCount * (randomInt(3, 10)/ 10)))
    console.log(`${nowDateTimeString()} [clone USD faucet] start task, total: ${indexList.length}, index: [${indexList}]`)
    const [start, end] = getSleepScope(indexList.length)
    for (const index of indexList) {
        try {
            await faucet(index)
        } catch (e) {
            console.error(`${nowDateTimeString()} [clone USD faucet] task error, wallet index: [${index}]`, e)
            continue
        }
        await sleepRandom(start, end)
    }
}

async function main() {
    if (config.wallet.mnemonic.split(' ').length < 12) {
        console.error('mnemonic is invalid, see config.toml')
        return
    }
    while (true) {
        runFaucetTask(); 
        // 随机等待 10 ~ 24 小时
        await sleepRandom(1000 * 60 * 60 * 10, 1000 * 60 * 60 * 24)
    }
}

main()