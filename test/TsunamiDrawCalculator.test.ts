import { expect } from 'chai';
import { deployMockContract, MockContract } from 'ethereum-waffle';
import { utils, Contract, BigNumber } from 'ethers';
import { ethers, artifacts } from 'hardhat';

const printUtils = require("./helpers/printUtils")
const { green, dim } = printUtils

const { getSigners } = ethers;

type DrawSettings = {
  matchCardinality: BigNumber;
  pickCost: BigNumber;
  distributions: BigNumber[];
  bitRangeSize: BigNumber;
};

describe.only('TsunamiDrawCalculator', () => {
    let drawCalculator: Contract; let ticket: MockContract;
    let wallet1: any;
    let wallet2: any;
    let wallet3: any;

    const encoder = ethers.utils.defaultAbiCoder

    async function findWinningNumberForUser(userAddress: string, matchesRequired: number, drawSettings: DrawSettings) {
        dim(`searching for ${matchesRequired} winning numbers for ${userAddress} with drawSettings ${JSON.stringify(drawSettings)}..`)
        const drawCalculator: Contract = await deployDrawCalculator(wallet1)
        
        let ticketArtifact = await artifacts.readArtifact('Ticket')
        ticket = await deployMockContract(wallet1, ticketArtifact.abi)
        
        await drawCalculator.initialize(ticket.address, drawSettings)
        
        const timestamp = 42
        const prizes = [utils.parseEther("1")]
        const pickIndices = encoder.encode(["uint256[][]"], [[["1"]]])
        const ticketBalance = utils.parseEther("10")

        await ticket.mock.getBalancesAt.withArgs(userAddress, [timestamp]).returns([ticketBalance]) // (user, timestamp): balance

        const distributionIndex = drawSettings.matchCardinality.toNumber() - matchesRequired
        dim(`distributionIndex: ${distributionIndex}`)

        if(drawSettings.distributions.length < distributionIndex){
           throw new Error(`There are only ${drawSettings.distributions.length} tiers of prizes`) // there is no "winning number" in this case
        }

        // now calculate the expected prize amount for these settings
        const fraction : BigNumber =  await drawCalculator.calculatePrizeDistributionFraction(drawSettings, distributionIndex)
        
        const expectedPrizeAmount : BigNumber = (prizes[0]).mul(fraction as any).div(ethers.constants.WeiPerEther) 

        dim(`expectedPrizeAmount: ${utils.formatEther(expectedPrizeAmount as any)}`)
        let winningRandomNumber

        while(true){
            winningRandomNumber = utils.solidityKeccak256(["address"], [ethers.Wallet.createRandom().address])
            const prizesAwardable : BigNumber[] = await drawCalculator.calculate(
                userAddress,
                [winningRandomNumber],
                [timestamp],
                prizes,
                pickIndices
            )
            const testEqualTo = (prize: BigNumber): boolean => prize.eq(expectedPrizeAmount)
            if(prizesAwardable.some(testEqualTo)){
              green(`found a winning number! ${winningRandomNumber}`)
              break
            }
        }
    
        return winningRandomNumber
    }
  
    async function deployDrawCalculator(signer: any): Promise<Contract> {
        const drawCalculatorFactory = await ethers.getContractFactory(
        'TsunamiDrawCalculatorHarness',
        signer,
        );
        const drawCalculator: Contract = await drawCalculatorFactory.deploy();
        return drawCalculator;
    }

  beforeEach(async () => {
    [wallet1, wallet2, wallet3] = await getSigners();
    drawCalculator = await deployDrawCalculator(wallet1);

    let ticketArtifact = await artifacts.readArtifact('Ticket');
    ticket = await deployMockContract(wallet1, ticketArtifact.abi);

    const drawSettings: DrawSettings = {
      distributions: [ethers.utils.parseEther('0.8'), ethers.utils.parseEther('0.2')],
      pickCost: BigNumber.from(utils.parseEther('1')),
      matchCardinality: BigNumber.from(5),
      bitRangeSize: BigNumber.from(4),
    };
    
    await drawCalculator.initialize(ticket.address, drawSettings);
    
  });

  // describe('finding winning random numbers with helper', () => {
  //   it('find 3 winning numbers', async () => {
  //     const params: DrawSettings = {
  //       matchCardinality: BigNumber.from(5),
  //       distributions: [
  //         ethers.utils.parseEther('0.6'),
  //         ethers.utils.parseEther('0.1'),
  //         ethers.utils.parseEther('0.1'),
  //         ethers.utils.parseEther('0.1'),
  //       ],
  //       pickCost: BigNumber.from(utils.parseEther("1")),
  //       bitRangeSize: BigNumber.from(3),
  //     };
  //     const result = await findWinningNumberForUser(wallet1.address, 3, params);
  //   });
  // });

  describe('admin functions', () => {
    it('onlyOwner can setPrizeSettings', async () => {
      const params: DrawSettings = {
        matchCardinality: BigNumber.from(5),
        distributions: [
          ethers.utils.parseEther('0.6'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
        ],
        pickCost: BigNumber.from(utils.parseEther("1")),
        bitRangeSize: BigNumber.from(4),
      };

      expect(await drawCalculator.setDrawSettings(params)).to.emit(
        drawCalculator,
        'DrawSettingsSet',
      );

      await expect(drawCalculator.connect(wallet2).setDrawSettings(params)).to.be.reverted;
    });

    it('cannot set over 100pc of prize for distribution', async () => {
      const params: DrawSettings = {
        matchCardinality: BigNumber.from(5),
        distributions: [
          ethers.utils.parseEther('0.9'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
        ],
        pickCost: BigNumber.from(utils.parseEther("1")),
        bitRangeSize: BigNumber.from(4),
      };
      await expect(drawCalculator.setDrawSettings(params)).to.be.revertedWith(
        'DrawCalc/distributions-gt-100%',
      );
    });
  });


  describe.only('calculateDistributionIndex()', () => {
    it('calculates distribution index 0', async () => {
      const drawSettings: DrawSettings = {
        matchCardinality: BigNumber.from(5),
        distributions: [
          ethers.utils.parseEther('0.6'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
        ],
        pickCost: BigNumber.from(utils.parseEther("1")),
        bitRangeSize: BigNumber.from(4),
      };

      const bitMasks = await drawCalculator.createBitMasks(drawSettings);
      const winningRandomNumber = "0x369ddb959b07c1d22a9bada1f3420961d0e0252f73c0f5b2173d7f7c6fe12b70"
      const userRandomNumber = "0x369ddb959b07c1d22a9bada1f3420961d0e0252f73c0f5b2173d7f7c6fe12b70"
      const prizeDistributionIndex: BigNumber= await drawCalculator.calculateDistributionIndex(userRandomNumber, winningRandomNumber, bitMasks)

      expect(prizeDistributionIndex).to.eq(BigNumber.from(0))
    })

    it.only('calculates distribution index 1', async () => {
      const drawSettings: DrawSettings = {
        matchCardinality: BigNumber.from(2),
        distributions: [
          ethers.utils.parseEther('0.6'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
        ],
        pickCost: BigNumber.from(utils.parseEther("1")),
        bitRangeSize: BigNumber.from(4),
      };
      // 252: 1111 1100
      // 255  1111 1111

      const bitMasks = await drawCalculator.createBitMasks(drawSettings);
      expect(bitMasks.length).to.eq(2) // same as length of matchCardinality
      expect(bitMasks[0]).to.eq(BigNumber.from(15))
      
      const prizeDistributionIndex: BigNumber= await drawCalculator.calculateDistributionIndex(252, 255, bitMasks)

      expect(prizeDistributionIndex).to.eq(BigNumber.from(1))
    })
  })

  describe("createBitMasks()", () => {
    it("creates bit masks", async () => {
      // 61676: 001111 000011 101100
      // 61612: 001111 000010 101100
    
    })
  })

  describe('calculate()', () => {
    it('should calculate and win grand prize', async () => {
      const winningNumber = utils.solidityKeccak256(['address'], [wallet1.address]);
      const winningRandomNumber = utils.solidityKeccak256(
        ['bytes32', 'uint256'],
        [winningNumber, 1],
      );

      const timestamp = 42;
      const prizes = [utils.parseEther('100')];
      const pickIndices = encoder.encode(['uint256[][]'], [[['1']]]);
      const ticketBalance = utils.parseEther('10');

      await ticket.mock.getBalancesAt.withArgs(wallet1.address, [timestamp]).returns([ticketBalance]); // (user, timestamp): balance

      console.log("winningRandomNumber ", winningRandomNumber);
      console.log("user address", wallet1.address);
      const prizesAwardable = await drawCalculator.calculate(
        wallet1.address,
        [winningRandomNumber],
        [timestamp],
        prizes,
        pickIndices,
      )

      expect(prizesAwardable[0]).to.equal(utils.parseEther('80'));

      console.log(
        'GasUsed for calculate(): ',
        (
          await drawCalculator.estimateGas.calculate(
            wallet1.address,
            [winningRandomNumber],
            [timestamp],
            prizes,
            pickIndices,
          )
        ).toString(),
      );
    });

    it('should calculate and win grand prize multiple picks', async () => {
      const winningNumber = utils.solidityKeccak256(['address'], [wallet1.address]);
      const winningRandomNumber = utils.solidityKeccak256(
        ['bytes32', 'uint256'],
        [winningNumber, 1],
      );

      const timestamp = 42;
      const prizes = [utils.parseEther('100')];
      const pickIndices = encoder.encode(['uint256[][]'], [[[...new Array<number>(1000).keys()]]]);
      const ticketBalance = utils.parseEther('20000');

      await ticket.mock.getBalancesAt.withArgs(wallet1.address, [timestamp]).returns([ticketBalance]); // (user, timestamp): balance

      const prizesAwardable = await drawCalculator.calculate(
        wallet1.address,
        [winningRandomNumber],
        [timestamp],
        prizes,
        pickIndices,
      )

      // expect(prizesAwardable[0]).to.equal(utils.parseEther('80'));

      console.log(
        'GasUsed for calculate two picks(): ',
        (
          await drawCalculator.estimateGas.calculate(
            wallet1.address,
            [winningRandomNumber],
            [timestamp],
            prizes,
            pickIndices,
          )
        ).toString(),
      );
    });

    it('should calculate for multiple picks, first pick grand prize winner, second pick no winnings', async () => {
      //function calculate(address user, uint256[] calldata randomNumbers, uint256[] calldata timestamps, uint256[] calldata prizes, bytes calldata data) external override view returns (uint256){

      const winningNumber = utils.solidityKeccak256(['address'], [wallet1.address]);
      const winningRandomNumber = utils.solidityKeccak256(
        ['bytes32', 'uint256'],
        [winningNumber, 1],
      );

      const timestamp1 = 42;
      const timestamp2 = 51;
      const prizes = [utils.parseEther('100'), utils.parseEther('20')];
      const pickIndices = encoder.encode(['uint256[][]'], [[['1'], ['2']]]);
      const ticketBalance = utils.parseEther('10');
      const ticketBalance2 = utils.parseEther('10');

      await ticket.mock.getBalancesAt
        .withArgs(wallet1.address, [timestamp1, timestamp2])
        .returns([ticketBalance, ticketBalance2]); // (user, timestamp): balance

      const prizesAwardable = await drawCalculator.calculate(
        wallet1.address,
        [winningRandomNumber, winningRandomNumber],
        [timestamp1, timestamp2],
        prizes,
        pickIndices,
      )

      expect(
        prizesAwardable[0]
      ).to.equal(utils.parseEther('80'));

      console.log(
        'GasUsed for 2 calculate() calls: ',
        (
          await drawCalculator.estimateGas.calculate(
            wallet1.address,
            [winningRandomNumber, winningRandomNumber],
            [timestamp1, timestamp2],
            prizes,
            pickIndices,
          )
        ).toString(),
      );

    });

    it('should not have enough funds for a second pick and revert', async () => {
      const winningNumber = utils.solidityKeccak256(['address'], [wallet1.address]);
      const winningRandomNumber = utils.solidityKeccak256(
        ['bytes32', 'uint256'],
        [winningNumber, 1],
      );

      const timestamp1 = 42;
      const timestamp2 = 51;
      const prizes = [utils.parseEther('100'), utils.parseEther('20')];
      const pickIndices = encoder.encode(['uint256[][]'], [[['1'], ['2']]]);
      const ticketBalance = utils.parseEther('10');
      const ticketBalance2 = utils.parseEther('0.4');

      await ticket.mock.getBalancesAt
        .withArgs(wallet1.address, [timestamp1, timestamp2])
        .returns([ticketBalance, ticketBalance2]); // (user, timestamp): balance

      const drawSettings: DrawSettings = {
        distributions: [ethers.utils.parseEther('0.8'), ethers.utils.parseEther('0.2')],
        pickCost: BigNumber.from(utils.parseEther("10")),
        matchCardinality: BigNumber.from(5),
        bitRangeSize: BigNumber.from(4),
      };

      await drawCalculator.setDrawSettings(drawSettings)

      await expect(
        drawCalculator.calculate(
          wallet1.address,
          [winningRandomNumber, winningRandomNumber],
          [timestamp1, timestamp2],
          prizes,
          pickIndices,
        ),
      ).to.revertedWith('DrawCalc/insufficient-user-picks');
    });

    it.skip('should calculate and win nothing', async () => {
      const winningNumber = utils.solidityKeccak256(['address'], [wallet2.address]);
      const userRandomNumber = utils.solidityKeccak256(['bytes32', 'uint256'], [winningNumber, 1]);
      const timestamp = 42;
      const prizes = [utils.parseEther('100')];
      const pickIndices = encoder.encode(['uint256[][]'], [[['1']]]);
      const ticketBalance = utils.parseEther('10');

      await ticket.mock.getBalancesAt.withArgs(wallet1.address, [timestamp]).returns([ticketBalance]); // (user, timestamp): balance

      const prizesAwardable = await drawCalculator.calculate(
        wallet1.address,
        [userRandomNumber],
        [timestamp],
        prizes,
        pickIndices,
      )

     expect(
        prizesAwardable[0]
      ).to.equal(utils.parseEther('0'));
    });

    it.skip('increasing the matchCardinality for same user and winning numbers results in less of a prize', async () => {
      const timestamp = 42;
      const prizes = [utils.parseEther('100')];
      const pickIndices = encoder.encode(['uint256[][]'], [[['1']]]);
      const ticketBalance = utils.parseEther('10');

      await ticket.mock.getBalancesAt.withArgs(wallet1.address, [timestamp]).returns([ticketBalance]); // (user, timestamp): balance

      let params: DrawSettings = {
        matchCardinality: BigNumber.from(6),
        distributions: [
          ethers.utils.parseEther('0.2'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
        ],
        pickCost: BigNumber.from(utils.parseEther('1')),
        bitRangeSize: BigNumber.from(4),
      };
      await drawCalculator.setDrawSettings(params);

      let winningRandomNumber = await findWinningNumberForUser(wallet1.address, 3, params);
      const resultingPrizes = await drawCalculator.calculate(
        wallet1.address,
        [winningRandomNumber],
        [timestamp],
        prizes,
        pickIndices,
      );
      expect(resultingPrizes[0]).to.equal(ethers.BigNumber.from(utils.parseEther('0.00244140625')));

      // now increase cardinality
      params = {
        matchCardinality: BigNumber.from(7),
        distributions: [
          ethers.utils.parseEther('0.2'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
        ],
        pickCost: BigNumber.from(utils.parseEther('1')),
        bitRangeSize: BigNumber.from(4),
      };
      await drawCalculator.setDrawSettings(params);
      
      winningRandomNumber = await findWinningNumberForUser(wallet1.address, 3, params);
      const resultingPrizes2 = await drawCalculator.calculate(
        wallet1.address,
        [winningRandomNumber],
        [timestamp],
        prizes,
        pickIndices,
      );

      expect(resultingPrizes2[0]).to.equal(ethers.BigNumber.from("152587890625000"));
    });

    it.skip('increasing the number range results in lower probability of matches', async () => {
      //function calculate(address user, uint256[] calldata winningRandomNumbers, uint256[] calldata timestamps, uint256[] calldata prizes, bytes calldata data)
      const timestamp = 42;
      const prizes = [utils.parseEther('100')];
      const pickIndices = encoder.encode(['uint256[][]'], [[['1']]]);
      const ticketBalance = utils.parseEther('10');

      await ticket.mock.getBalancesAt.withArgs(wallet1.address, [timestamp]).returns([ticketBalance]); // (user, timestamp): balance

      let params: DrawSettings = {
        matchCardinality: BigNumber.from(5),
        distributions: [
          ethers.utils.parseEther('0.2'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
        ],
        pickCost: BigNumber.from(utils.parseEther('1')),
        bitRangeSize: BigNumber.from(3),
      };
      await drawCalculator.setDrawSettings(params);

      const winningRandomNumber = await findWinningNumberForUser(wallet1.address, 3, params);

      const resultingPrizes = await drawCalculator.calculate(
        wallet1.address,
        [winningRandomNumber],
        [timestamp],
        prizes,
        pickIndices,
      );
      expect(resultingPrizes[0]).to.equal(
        ethers.BigNumber.from("156250000000000000"),
      );
      // now increase number range
      params = {
        matchCardinality: BigNumber.from(5),
        distributions: [
          ethers.utils.parseEther('0.2'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
          ethers.utils.parseEther('0.1'),
        ],
        pickCost: BigNumber.from(utils.parseEther('1')),
        bitRangeSize: BigNumber.from(4),
      };
      await drawCalculator.setDrawSettings(params);

      const winningRandomNumber2 = await findWinningNumberForUser(wallet1.address, 3, params);

      const resultingPrizes2 = await drawCalculator.calculate(
        wallet1.address,
        [winningRandomNumber2],
        [timestamp],
        prizes,
        pickIndices,
      );
      expect(resultingPrizes2[0]).to.equal(ethers.BigNumber.from("39062500000000000"));
    });
  });
});
