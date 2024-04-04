import config from './config.toml'
import { nowDateTimeString, sleepRandom } from "../util/time";
import { HDWallet } from '../util/solana'
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction, type ParsedAccountData, type AccountInfo, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ExtensionType, LENGTH_SIZE, TOKEN_2022_PROGRAM_ID, TYPE_SIZE, createAssociatedTokenAccountInstruction, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, createMintToInstruction, createTransferCheckedInstruction, getAssociatedTokenAddress, getMint, getMintLen } from '@solana/spl-token'
import { randomElement, randomIndexList, randomInt } from '../util/random'
import { createInitializeInstruction, pack, type TokenMetadata } from '@solana/spl-token-metadata'
import tokenData from './token.json'


/**
 * 创建 token(TOKEN_2022_PROGRAM_ID)
 * @param wallet 钱包
 */
async function createToken(payer: Keypair): Promise<PublicKey> {
    const mint = Keypair.generate()
    const decimals = randomInt(9, 16)
    const tokenInfo = randomElement(tokenData)
    const metadata: TokenMetadata = {
        mint: mint.publicKey,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        uri: `https://docs.eclipse.xyz/${tokenInfo.symbol}`,
        additionalMetadata: []
    }
    const mintLen = getMintLen([ExtensionType.MetadataPointer])
    const connection = new Connection(config.eclipse.rpc, 'confirmed')
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
    // 可豁免租金的最小余额
    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);
    const mintTransaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mint.publicKey,
            lamports: mintLamports,
            space: mintLen,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMetadataPointerInstruction(
            mint.publicKey,
            payer.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintInstruction(mint.publicKey, decimals, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
        createInitializeInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            mint: mint.publicKey,
            metadata: mint.publicKey,
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            mintAuthority: payer.publicKey,
            updateAuthority: payer.publicKey
        }),
    )
    const sig = await sendAndConfirmTransaction(connection, mintTransaction, [payer, mint])
    console.log(`${nowDateTimeString()} [eclipse] Address: [${payer.publicKey.toBase58()}] create token success! tx: ${sig}`)

    return mint.publicKey
}

/**
 * 为目标账户铸造代币
 * 铸造账户的 Authority 应该是 钱包账户
 * @param payer 钱包
 * @param mint 铸造账户
 * @param targetAccount 目标账户（非 token 账户）
 */
async function mintToken(payer: Keypair, mint: PublicKey, targetAccount: PublicKey) {
    const connection = new Connection(config.eclipse.rpc, 'confirmed')

    const mintAccount = await getMint(connection, mint, undefined, TOKEN_2022_PROGRAM_ID)


    // 判断是否存在 token 账户，如果不存在则要先创建
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(targetAccount, {
        mint: mint,
        programId: TOKEN_2022_PROGRAM_ID
    })

    const ata = await getAssociatedTokenAddress(mint, targetAccount, undefined, TOKEN_2022_PROGRAM_ID)
    const tx = new Transaction()
    if (tokenAccounts.value.length === 0) {
        tx.add(
            createAssociatedTokenAccountInstruction(
                payer.publicKey,
                ata,
                targetAccount,
                mint,
                TOKEN_2022_PROGRAM_ID
            )
        )
    }
    // 根据 token 的精度随机生成一个数量
    const amount = 10 ** mintAccount.decimals * randomInt(2000, 70000)
    tx.add(
        createMintToInstruction(
            mint,
            ata,
            payer.publicKey,
            amount,
            undefined,
            TOKEN_2022_PROGRAM_ID
        )
    )
    const sig = await sendAndConfirmTransaction(connection, tx, [payer])
    console.log(`${nowDateTimeString()} [eclipse] Address: [${targetAccount.toBase58()}] mint token success, mint: ${mint.toBase58()} [${amount / (10 ** mintAccount.decimals)}] \ntx: ${sig}`)
}



/**
 * 发送 token
 * @param payer 钱包，用于支付交易费用
 * @param tokenAccount 钱包账户对应的 token 账户
 * @param targetAccount 目标钱包
 * @returns 
 */
async function sendToken(payer: Keypair, tokenAccount: {
    pubkey: PublicKey;
    account: AccountInfo<ParsedAccountData>;
}, targetAccount: PublicKey) {
    const connection = new Connection(config.eclipse.rpc, 'confirmed')
    const balance = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount
    const randomAmount = randomInt(200, 1000)
    if (balance <= randomAmount) {
        console.warn(`${nowDateTimeString()} [eclipse] Address: [${payer.publicKey.toBase58()}] token balance is not enough, skip send token`)
        return
    }
    const mintAccount = new PublicKey(tokenAccount.account.data.parsed.info.mint)
    const ata = await getAssociatedTokenAddress(mintAccount, targetAccount, undefined, TOKEN_2022_PROGRAM_ID)
    const targetTokenAccounts = await connection.getParsedTokenAccountsByOwner(targetAccount, {
        mint: mintAccount,
        programId: TOKEN_2022_PROGRAM_ID
    })
    const tx = new Transaction()
    // 如果目标账户没有 token 账户，则创建
    if (targetTokenAccounts.value.length === 0) {
        tx.add(
            createAssociatedTokenAccountInstruction(
                payer.publicKey,
                ata,
                targetAccount,
                mintAccount,
                TOKEN_2022_PROGRAM_ID
            )
        )
    }
    tx.add(
        createTransferCheckedInstruction(
            tokenAccount.pubkey,
            mintAccount,
            ata,
            payer.publicKey,
            randomAmount * 10 ** tokenAccount.account.data.parsed.info.tokenAmount.decimals,
            tokenAccount.account.data.parsed.info.tokenAmount.decimals,
            undefined,
            TOKEN_2022_PROGRAM_ID
        )
    )
    const sig = await sendAndConfirmTransaction(connection, tx, [payer])
    console.log(`${nowDateTimeString()} [eclipse] Address: [${payer.publicKey.toBase58()}] send token success, mint: ${mintAccount.toBase58()} [${randomAmount}] to ${targetAccount.toBase58()} \ntx: ${sig}`)
}

/**
 * token 交互任务
 * 1. 创建代币（如果持有代币超过随机上限则跳过）
 * 2. 铸造代币给自己或者其他账户
 * 3. 发送代币给随机子账户
 * @param index HD 钱包索引
 */
async function task(index: number) {
    const connection = new Connection(config.eclipse.rpc, 'confirmed')
    const wallet = new HDWallet(config.wallet.mnemonic, `m/44'/501'/${index}'/0`)
    const payer = wallet.keypair
    const tokenAccounts = (await connection.getParsedTokenAccountsByOwner(payer.publicKey, {
        programId: TOKEN_2022_PROGRAM_ID
    })).value

    // 1. 创建代币
    const randomTokenLimit = randomInt(2, 10)
    if (tokenAccounts.length >= randomTokenLimit) {
        console.log(`${nowDateTimeString()} [eclipse] Address: [${wallet.address}] has ${tokenAccounts.length} tokens, skip create token`)
    } else {
        const balance = await connection.getBalance(payer.publicKey)
        if (balance / LAMPORTS_PER_SOL <= 0.01) {
            console.warn(`${nowDateTimeString()} [eclipse] Address: [${wallet.address}] balance is not enough, skip create token`)
        } else {
            try {
                const mintPublicKey = await createToken(payer)
                console.log(`${nowDateTimeString()} [eclipse] Address: [${wallet.address}] create token success`)
                // 给自己 mint 
                await mintToken(payer, mintPublicKey, payer.publicKey)
            } catch (error) {
                console.error(`${nowDateTimeString()} [eclipse] Address: [${wallet.address}] create token error: ${error}`)
            }

        }
    }
    // 当前没有 token 账户，直接结束
    if (tokenAccounts.length == 0) {
        console.warn(`${nowDateTimeString()} [eclipse] Address: [${wallet.address}] has no token account, skip mint token`)
        return
    }

    // 2. 随机获取一个代币账户用于给目标账户铸币
    const token = randomElement(tokenAccounts)
    const randomIndex = randomInt(0, 10000)
    // 随机给自己或者其他账户铸币，给自己铸币的概率 20%
    const targetAddress = randomIndex < 200 ? payer.publicKey.toBase58() : new HDWallet(config.wallet.mnemonic, `m/44'/60'/${index}'/0/${randomIndex}`).address
    try {
        await mintToken(payer, new PublicKey(token.account.data.parsed.info.mint), new PublicKey(targetAddress))
    } catch (error) {
        console.error(`${nowDateTimeString()} [eclipse] Address: [${wallet.address}] mint token [${token.account.data.parsed.info.mint}] to [${targetAddress}] error: ${error}`)
    }

    // 3. 随机给一个子账户发送 token
    const token2 = randomElement(tokenAccounts)
    const targetAccount2 = new HDWallet(config.wallet.mnemonic, `m/44'/60'/${index}'/0/${randomInt(0, 10000)}`).keypair.publicKey
    try {
        await sendToken(payer, token2, targetAccount2)
    } catch (error) {
        console.error(`${nowDateTimeString()} [eclipse] Address: [${wallet.address}] send token error: ${error}`)
    }

}
async function runTask() {
    // 打乱顺序，再取一半出来执行
    const indexList = randomIndexList(config.wallet.count).splice(Math.floor(config.wallet.count / 2))
    console.log(`${nowDateTimeString()} [eclipse] start task, total: ${indexList.length}, index: [${indexList}]`)
    for (const index of indexList) {
        try {
            await task(index)
        } catch (e) {
            console.error(`${nowDateTimeString()} [eclipse token] task error, wallet index: [${index}]`, e)
        }
        // 随机等待 2-30 分钟
        await sleepRandom(1000 * 60 * 2, 1000 * 60 * 30)
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
        // 随机等待 16 ~ 24 小时
        await sleepRandom(1000 * 60 * 60 * 16, 1000 * 60 * 60 * 24)
    }
}

main()
