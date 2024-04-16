import { HDWallet } from '../util/solana'
import config from './config.toml'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const URL_PREFIX = "https://api.v-token.io/api/points";

interface UserInfo {
    address: string,
    inviteCode: string,
    totalPoints: number,
    checkInPoints: number,
    invitePoints: number,
    today: number,
    assets?: number | string,
}

interface RankInfo {
    address: string,
    level: string,
    points: number,
    rank: string,
}

/**
 * 查询当前积分信息
 * @param address 地址
 * @returns 
 */
async function home(address: string): Promise<UserInfo> {
    const resp = await fetch(`${URL_PREFIX}/home?address=${address}`);
    const json = await resp.json();
    if (json.code != 200) {
        throw new Error(json.msg)
    }
    return {
        address,
        // 邀请码
        inviteCode: json.data.referrals_code,
        // 总积分
        totalPoints: json.data.earnings,
        // 签到积分
        checkInPoints: json.data.broadband_points,
        // 邀请积分
        invitePoints: json.data.invite_points,
        today: json.data.today_earnings,
    }
}

async function queryRank(address: string): Promise<RankInfo> {
    const resp = await fetch(`${URL_PREFIX}/new_home?address=${address}`);
    const json = await resp.json();
    if (json.code != 200) {
        throw new Error(json.msg)
    }
    return {
        address,
        level: json.data.level,
        points: json.data.points,
        rank: json.data.rank,
    }
}

/**
 * 查询钱包中的 sol 资产
 * @param provider solana rpc
 * @param address 钱包地址
 * @returns 
 */
async function getBalance(provider: Connection, address: string): Promise<number| string> {
    try {
        const result = await provider.getBalance(new PublicKey(address))
        return result / LAMPORTS_PER_SOL
    } catch (e) {
        console.error(`查询余额失败: ${address}`, e)
        return 'query failed'
    }
}

/**
 * 批量查询积分 (通过配置文件中的助记词)
 */
async function queryPoints(showBalance = false) {
    const wallet = new HDWallet(config.wallet.mnemonic);
    const count = config.wallet.count;
    let res = await Promise.all(Array.from({ length: count }).map((_, i) => {
        const child = wallet.derive(i);
        return home(child.address).catch(e => {
            console.error(`查询失败: ${child.address}`, e.message)
            return null
        })
    }))
    res = res.filter(x => x != null)
    if (res.length == 0) {
        console.error('查询信息失败，请先通过 index.ts 完成注册')
        return
    }
    if (showBalance) {
        console.log('查询 SOL 资产中...')
        // 可从 https://solana.com/rpc 找到 rpc 节点，当前是从 getblock.io 获取的
        const provider = new Connection('https://go.getblock.io/a6e77549eca4459ba588a1e4905e76e7')
        for (const item of res) {
            if (item == null) return

            item.assets = await getBalance(provider, item.address)
        }
    }
    console.table(res)
    console.log(`添加助记词到配置文件中，可刷邀请积分，${res.map(item => "'" + item?.inviteCode + "'").join(',')}`)
}

/**
 * 批量查询排名
 */
async function queryRanks() {
    const wallet = new HDWallet(config.wallet.mnemonic);
    const count = 60;
    const res = []
    for (let i = 0; i < count; i++) {
        const child = wallet.derive(i);
        const item = await queryRank(child.address).catch(e => {
            console.error(`查询失败: ${child.address}`, e.message)
            return null
        })
        if (item == null) continue
        res.push(item)
    }
    console.table(res)
}

// 批量查看积分
// queryPoints()

// 批量查看钱包积分和对应的 sol 资产，rpc 节点限流，串行调用，比较慢
// queryPoints(true)
queryRanks()