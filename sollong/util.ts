import { HDWallet } from '../util/solana'
import config from './config.toml'

const URL_PREFIX = "https://api.v-token.io/api/points";

/**
 * 查询当前积分信息
 * @param address 地址
 * @returns 
 */
async function home(address: string) {
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
        invitePoints: json.data.invite_points
    }
}


/**
 * 批量查询积分 (通过配置文件中的助记词)
 */
async function queryPoints() {
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
    console.table(res)
    console.log(`添加助记词到配置文件中，可刷邀请积分，${res.map(item => "'"+item?.inviteCode+"'").join(',')}`)
}


// 批量查看积分
queryPoints()