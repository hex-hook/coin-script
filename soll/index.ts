import { HDWallet } from '../util/solana'
import config from './config.toml'
import { sleepRandom } from '../util/time'
import { nowDateTimeString } from '../util/time'
import data from './data.json'

interface MnemonicData {
    mnemonic: string
    count: number
}
const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0"

/**
 * 查询邀请码
 * @param address 钱包地址
 * @returns 
 */
async function getShareCode(address: string): Promise<string> {
    const resp = await fetch('https://soll.cc/', {
        headers: {
            Cookie: `think_address=${address}`,
            'User-Agent': ua
        }
    })
    if (resp.status != 200) {
        console.error(`get share code failed: ${resp.status}`)
        return ''
    }
    const html = await resp.text()
    const match = html.match(/soll\.cc\/.{5}/)
    if (match) {
        return match[0].split('/')[1]
    }
    return ''

}

/**
 * 提交登记
 * @param address 钱包地址
 * @param code 邀请码
 * @returns 
 */
async function submit(address: string, code: string): Promise<boolean> {
    const resp = await fetch('https://soll.cc/index/index/post.html', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': ua
        },
        body: `address=${address}&sharecode=${code}`
    })
    if (resp.status == 200) {
        console.log(`${nowDateTimeString()} ${code} 邀请 ${address} 提交成功`)
        return true
    } else {
        console.error(`${nowDateTimeString()} ${code} 邀请 ${address} 提交失败`)
        return false
    }
}

/**
 * 分别从配置文件和生成的文件中获取邀请码，然后通过新的助记词生成新的地址进行邀请登记
 */
async function main() {
    // 优先使用新生成的邀请码
    let codes: string[] = data.codes.length == 0 ? config.invite.codes : data.codes
    if (codes.length == 0) {
        console.error('no invite code')
        return
    }

    const root = HDWallet.generate()
    const appendCodes = []
    const mnemonicData: MnemonicData[] = data.mnemonic || []
    for (let i = 0; i < codes.length; i++) {
        let success = 0
        const code = codes[i]
        const times = parseInt(`${Math.random() * 10 + 5}`)
        let walletIndex = 0
        for (let j = 0; j < times; j++) {
            const wallet = root.derive(walletIndex)
            walletIndex++
            try {
                const res = await submit(wallet.address, code)
                if (res) {
                    success++
                } else {
                    break
                }
                await sleepRandom()
                const shareCode = await getShareCode(wallet.address)
                if (shareCode.length == 5) {
                    appendCodes.push(shareCode)
                }
            } catch (e) {
                console.error(`${nowDateTimeString()} 提交失败`, e)
                break
            }
        }
        mnemonicData.push({ mnemonic: root.mnemonic, count: walletIndex })
        console.log(`${nowDateTimeString()} ${code} 提交成功 ${success}/${walletIndex} `)
    }

    try {
        // 只保存未使用过的邀请码
        await Bun.write('soll/data.json', JSON.stringify({ codes: appendCodes, mnemonic: mnemonicData }))
        console.log(`${nowDateTimeString()} wallet write data.json success`)
    } catch (e) {
        console.error('write data.json failed', e)
        console.log(`mnemonic: ${root.mnemonic}\ncodes: ${appendCodes.join(',')}`)
    }
}

main()