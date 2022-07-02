import { Wallet } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { UniswapV3Factory } from '../typechain/UniswapV3Factory'
import { expect } from './shared/expect'
import snapshotGasCost from './shared/snapshotGasCost'

import { FeeAmount, getCreate2Address, TICK_SPACINGS } from './shared/utilities'

const { constants } = ethers

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000',
]

const createFixtureLoader = waffle.createFixtureLoader

describe('UniswapV3Factory', () => {
  let wallet: Wallet, other: Wallet

  let factory: UniswapV3Factory
  let poolBytecode: string
  const fixture = async () => {
    const factoryFactory = await ethers.getContractFactory('UniswapV3Factory')
    return (await factoryFactory.deploy()) as UniswapV3Factory
  }

  let loadFixture: ReturnType<typeof createFixtureLoader>
  before('create fixture loader', async () => {
    ;[wallet, other] = await (ethers as any).getSigners()

    loadFixture = createFixtureLoader([wallet, other])
  })

  before('load pool bytecode', async () => {
    poolBytecode = (await ethers.getContractFactory('UniswapV3Pool')).bytecode // 编译所得, 可以用于多次部署同一类的 contract 
  })

  beforeEach('deploy factory', async () => { // 部署 factory 
    factory = await loadFixture(fixture)
  })

  // it('owner is deployer', async () => {
  //   expect(await factory.owner()).to.eq(wallet.address) // 本 factory 属于部署者。 除非要在别的链上也部署 uniswap , 不然这样部署一次就够了 ?
  // })

  // it('factory bytecode size', async () => {
  //   // console.log(((await waffle.provider.getCode(factory.address)).length - 2) / 2);
  //   expect(((await waffle.provider.getCode(factory.address)).length - 2) / 2).to.matchSnapshot() // 获取 bytecode 长度
  // })

  // it('pool bytecode size', async () => { // 创建 pool contract
  //   await factory.createPool(TEST_ADDRESSES[0] /* tokenA */, TEST_ADDRESSES[1], FeeAmount.MEDIUM/* 费率设为 0.3% */)
  //   // 通过 factory 创建 pool, 第一个用户创建后, 接下来的都不能创建同样的 pool, 只能添加 L ?
  //   const poolAddress = getCreate2Address(factory.address, TEST_ADDRESSES, FeeAmount.MEDIUM, poolBytecode/* 符合 UniswapV3Pool.sol 类型的 */)
  //   // 这 4 个参数能确定唯一的 pool
  //   expect(((await waffle.provider.getCode(poolAddress)).length - 2) / 2).to.matchSnapshot()  // 获取 bytecode 长度
  // })

  // it('initial enabled fee amounts', async () => {
  //   console.log(FeeAmount.LOW, await factory.feeAmountTickSpacing(FeeAmount.LOW)); // TickSpacing 是什么 ? 
  //   // expect(await factory.feeAmountTickSpacing(FeeAmount.LOW)).to.eq(TICK_SPACINGS[FeeAmount.LOW])
  //   // expect(await factory.feeAmountTickSpacing(FeeAmount.MEDIUM)).to.eq(TICK_SPACINGS[FeeAmount.MEDIUM])
  //   // expect(await factory.feeAmountTickSpacing(FeeAmount.HIGH)).to.eq(TICK_SPACINGS[FeeAmount.HIGH])
  // })

  async function createAndCheckPool(
    tokens: [string, string],
    feeAmount: FeeAmount,
    tickSpacing: number = TICK_SPACINGS[feeAmount]
  ) {
    const create2Address = getCreate2Address(factory.address, tokens, feeAmount, poolBytecode) // 即 poolAddress
    const create = factory.createPool(tokens[0], tokens[1], feeAmount)
    // 通过 factory 创建 pool
    // createPool 函数中有 deploy 函数, 而 deploy 函数中有 salt 参数, salt 和 poolBytecode 可以算得唯一 poolAddress

    await expect(create) // 等待创建 pool 成功
      .to.emit(factory, 'PoolCreated')
      .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], feeAmount, tickSpacing, create2Address) // 可以在 log 中查看已经创建的 pool

    await expect(factory.createPool(tokens[0], tokens[1], feeAmount)).to.be.reverted // 再创建相同地址的 pool 会被拒绝
    await expect(factory.createPool(tokens[1], tokens[0], feeAmount)).to.be.reverted // 再创建相同地址的 pool 会被拒绝
    console.log(create2Address);
    expect(await factory.getPool(tokens[0], tokens[1], feeAmount), 'getPool in order').to.eq(create2Address) 
    // 已经创建好的 pool 可以被获取到
    expect(await factory.getPool(tokens[1], tokens[0], feeAmount), 'getPool in reverse').to.eq(create2Address)
    // 已经创建好的 pool 可以被获取到, 调换 token 顺序也一样

    const poolContractFactory = await ethers.getContractFactory('UniswapV3Pool') // UniswapV3Pool 一类的 contract 
    const pool = poolContractFactory.attach(create2Address) // 加载 contract 的第二种方式: attach
    expect(await pool.factory(), 'pool factory address').to.eq(factory.address) // 往上一层, 获取是通过哪个 factory 创建的本 pool
    expect(await pool.token0(), 'pool token0').to.eq(TEST_ADDRESSES[0]) // 获取 pool 的 token 对
    expect(await pool.token1(), 'pool token1').to.eq(TEST_ADDRESSES[1]) // 获取 pool 的 token 对
    expect(await pool.fee(), 'pool fee').to.eq(feeAmount) // 获取 pool 的 fee
    expect(await pool.tickSpacing(), 'pool tick spacing').to.eq(tickSpacing) // 获取 pool 的 tickSpacing
  }

  describe('#createPool', () => {
    it('succeeds for low fee pool', async () => {
      await createAndCheckPool(TEST_ADDRESSES, FeeAmount.LOW)
    })
    // it('succeeds for medium fee pool', async () => {
    //   await createAndCheckPool(TEST_ADDRESSES, FeeAmount.MEDIUM)
    // })
    // it('succeeds for high fee pool', async () => {
    //   await createAndCheckPool(TEST_ADDRESSES, FeeAmount.HIGH)
    // })

    // it('succeeds if tokens are passed in reverse', async () => {
    //   await createAndCheckPool([TEST_ADDRESSES[1], TEST_ADDRESSES[0]], FeeAmount.MEDIUM) // 调换 token 顺序也一样
    // })

    // it('fails if token a == token b', async () => {
    //   await expect(factory.createPool(TEST_ADDRESSES[0], TEST_ADDRESSES[0], FeeAmount.LOW)).to.be.reverted
    // })

    // it('fails if token a is 0 or token b is 0', async () => {
    //   await expect(factory.createPool(TEST_ADDRESSES[0], constants.AddressZero, FeeAmount.LOW)).to.be.reverted
    //   await expect(factory.createPool(constants.AddressZero, TEST_ADDRESSES[0], FeeAmount.LOW)).to.be.reverted
    //   await expect(factory.createPool(constants.AddressZero, constants.AddressZero, FeeAmount.LOW)).to.be.revertedWith(
    //     ''
    //   )
    // })

    // it('fails if fee amount is not enabled', async () => {
    //   await expect(factory.createPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], 250)).to.be.reverted // 只有 3 档 fee
    // })

    // it('gas', async () => {
    //   await snapshotGasCost(factory.createPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], FeeAmount.MEDIUM)) // 获取 gas 信息, 生成 snapshot
    // })

  })

  // describe('#setOwner', () => {
  //   it('fails if caller is not owner', async () => {
  //     await expect(factory.connect(other).setOwner(wallet.address)).to.be.reverted
  //   })

  //   it('updates owner', async () => {
  //     await factory.setOwner(other.address) // 所有者把 factory 的所有权给另一个人
  //     expect(await factory.owner()).to.eq(other.address)
  //   })

  //   it('emits event', async () => {
  //     await expect(factory.setOwner(other.address))
  //       .to.emit(factory, 'OwnerChanged')
  //       .withArgs(wallet.address, other.address)
  //   })

  //   it('cannot be called by original owner', async () => {
  //     await factory.setOwner(other.address)
  //     await expect(factory.setOwner(wallet.address)).to.be.reverted // 所有权送人了, 就不能再重设所有权了
  //   })
  // })

  // describe('#enableFeeAmount', () => {
  //   it('fails if caller is not owner', async () => {
  //     await expect(factory.connect(other).enableFeeAmount(100/* fee */, 2/* tick spacing */)).to.be.reverted
  //   })
  //   it('fails if fee is too great', async () => {
  //     await expect(factory.enableFeeAmount(1000000, 10)).to.be.reverted
  //   })
  //   it('fails if tick spacing is too small', async () => {
  //     await expect(factory.enableFeeAmount(500, 0)).to.be.reverted
  //   })
  //   it('fails if tick spacing is too large', async () => {
  //     await expect(factory.enableFeeAmount(500, 16834)).to.be.reverted
  //   })
  //   it('fails if already initialized', async () => {
  //     await expect(factory.enableFeeAmount(500, 10)).to.be.reverted // 默认的最小费率挡位已有, 不能再设
  //     await expect(factory.enableFeeAmount(500, 15)).to.be.reverted // 默认的最小费率挡位已有, 不能再设, 换 tick spacing 也不行
  //   })
  //   it('sets the fee amount in the mapping', async () => {
  //     await factory.enableFeeAmount(100, 5) // 设个新的 fee
  //     expect(await factory.feeAmountTickSpacing(100)).to.eq(5) // 查看此时 fee 对应的 tick spacing
  //   })
  //   it('emits an event', async () => {
  //     await expect(factory.enableFeeAmount(100, 5)).to.emit(factory, 'FeeAmountEnabled').withArgs(100, 5)
  //   })
  //   it('enables pool creation', async () => {
  //     await factory.enableFeeAmount(250, 15)
  //     await createAndCheckPool([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], 250, 15) // 可以用新设的 fee 创建 pool
  //   })
  // })
})
