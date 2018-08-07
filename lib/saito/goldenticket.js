const saito    = require('../saito');
const Big      = require('big.js');


/////////////////
// Constructor //
/////////////////
function GoldenTicket(app, gtjson="") {

  if (!(this instanceof GoldenTicket)) {
    return new GoldenTicket(app, gtjson);
  }
  this.app = app || {};

  this.solution 		= {};
  this.solution.target 		= "";
  this.solution.difficulty 	= "";
  this.solution.difficulty_vote	= "";
  this.solution.paysplit 	= "";
  this.solution.paysplit_vote 	= "";
  this.solution.pubkey	 	= "";
  this.solution.random	 	= "";
  this.solution.miner_share 	= 0;
  this.solution.node_share 	= 0;
  this.solution.sig		= "";

  if (gtjson != "") {
    try {
      this.solution = JSON.parse(gtjson);
    } catch (err) {
      return null;
    }
  }
  
  return this;

}
module.exports = GoldenTicket;


/////////////////////////
// calculateDifficulty //
/////////////////////////
//
// calculate difficulty for this block given our vote
//
// @params {saito.block} previous block
//
GoldenTicket.prototype.calculateDifficulty = function calculatDifficulty(prevblock) {
  if (this.solution.difficulty_vote == -1) {
    return (prevblock.returnDifficulty() - 0.01).toFixed(8);
  }
  if (this.solution.difficulty_vote == 1) {
    return (prevblock.returnDifficulty() + 0.01).toFixed(8);
  }
  return prevblock.returnDifficulty();
}


/////////////////////////////
// calculateMonetaryPolicy //
/////////////////////////////
//
// calculate monetary policy given previous block
//
// @params {saito.block} previous block
//
GoldenTicket.prototype.calculateMonetaryPolicy = function calculateMonetaryPolicy(prevblk) {

  let prev_treasury = prevblk.returnTreasury();
  let prev_reclaimed = prevblk.returnReclaimed();
  let prev_coinbase = prevblk.returnCoinbase();

  let new_treasury = Big(prev_treasury).plus(Big(prev_reclaimed));
  let new_coinbase = Big(new_treasury).div(prevblk.app.blockchain.genesis_period).toFixed(8);
      new_treasury = Big(new_treasury).minus(Big(new_coinbase)).toFixed(8);

  var mp = [];
  mp[0]  = new_treasury;
  mp[1]  = new_coinbase;

  return mp;

}


///////////////////////
// calculatePaysplit //
///////////////////////
//
// calculate paysplit given previous block
//
// @params {saito.block} previous block
//
GoldenTicket.prototype.calculatePaysplit = function calculatePaysplit(prevblock) {
  if (this.solution.paysplit_vote == -1) {
    return (prevblock.returnPaysplit() - 0.0001).toFixed(8);
  }
  if (this.solution.paysplit_vote == 1) {
    return (prevblock.returnPaysplit() + 0.0001).toFixed(8);
  }
  return prevblock.returnPaysplit();
}


////////////////////
// createSolution //
////////////////////
//
// given an accurate solution to a golden ticket (block) calculate
// all of the information we will need to include in a solution and 
// flesh out that data here in our Golden Ticket object.
//
// @params {saito.block} block w/ golden ticket
// @params {string} public key for solution
// @params {string} private key for solution
// @params {integer} random number for solution
//
GoldenTicket.prototype.createSolution = function createSolution(block_to_solve, solution_public_key, solution_private_key, solution_random_number) {

  //
  // this code is repeated in:
  //
  // 1. the "validate" Golden Ticket function below
  //
  // see also the validateFeeTransaction
  // see also the block creation in mempool
  //
  let burn_fee_needed = Big(block_to_solve.returnTransactionFeesNeededForThisBlock());
  let creator_surplus = Big(block_to_solve.returnTransactionFeesUsableForBlockCreatorSurplus());
  let total_surplus   = Big(block_to_solve.returnTransactionFeesTotalSurplus());

  //
  // total revenue to insert is BURN FEE + surplus not captured by block creator + COINBASE
  //
  let total_revenue = burn_fee_needed.plus(total_surplus).plus(Big(block_to_solve.block.coinbase)).minus(creator_surplus);
  let miner_share   = total_revenue.times(Big(block_to_solve.block.paysplit)).toFixed(8);
  let node_share    = total_revenue.minus(Big(miner_share)).toFixed(8);

//console.log("\n");
//console.log("creating the golden ticket and we have these fees:");
//console.log("   burn fee needed: " + burn_fee_needed);
//console.log("   creator surplus: " + creator_surplus);
//console.log("   total surplus: : " + total_surplus);
//console.log("\n");
//
//console.log("SOLUTION: ");
//console.log(" total revenue: " + total_revenue.toFixed(9));
//console.log(" miner share: " + miner_share);
//console.log(" node share: " + node_share);
//console.log("\n");

  this.solution.target          = block_to_solve.returnHash();
  this.solution.difficulty      = block_to_solve.returnDifficulty();
  this.solution.difficulty_vote = this.app.voter.returnDifficultyVote(this.solution.difficulty);
  this.solution.paysplit        = block_to_solve.returnPaysplit();
  this.solution.paysplit_vote   = block_to_solve.returnPaysplitVote();
  this.solution.pubkey          = solution_public_key;
  this.solution.random          = solution_random_number;
  this.solution.miner_share     = miner_share;
  this.solution.node_share      = node_share;
  this.solution.sig             = this.app.crypt.signMessage(this.returnSignatureSource(), solution_private_key);
    
}


//////////////////
// findWinners //
//////////////////
//
// given a solution, we figure out who the recipients of the 
// token issuance are going to be and return them in an array
//
// @params {saito.block} previous block
// @returns {array} of winners
//
GoldenTicket.prototype.findWinners = function findWinners(block_to_solve) {

    var winners    = [];

    // find which of the previous block transactions is Charlie
    // based on the hexadecimal number in our signature turned
    // into a selection mechanism for a walk through an array
    // of contenders
    let children  = block_to_solve.returnGoldenTicketContenders();
    let winner    = this.solution.sig.slice((-1 * (children.length)));
    let winnerInt = parseInt(winner, 16);
    let charlie   = children[winnerInt%children.length];

    winners[0] = new saito.slip(this.app.wallet.returnAddress(), this.solution.miner_share, 1);
    winners[1] = new saito.slip(charlie, this.solution.node_share, 1);

    if (winners[1].add == "") { winners[1].add = winners[0].add; }

    return winners;

}


///////////////////////////
// returnSignatureSource //
///////////////////////////
//
// what parts of the signature are we going to sign?
//
// @returns {string} string-to-sign
//
GoldenTicket.prototype.returnSignatureSource = function returnSignatureSource() {
 return this.solution.target + 
	this.solution.difficulty_vote + 
	this.solution.paysplit_vote + 
	this.solution.miner_share +
	this.solution.node_share;
}


//////////////
// validate //
//////////////
//
// validate that this golden ticket is a valid solution
// to the previous block, and that this block has the 
// appropriate difficulty and monetary settings.
//
// @params {saito.block} previous block
// @params {saito.block} this block
//
GoldenTicket.prototype.validate = function validate(prevblk, thisblk) {

  if (prevblk == null) { return -1; }
  if (thisblk == null) { return -1; }
  if (prevblk.is_valid == 0) { return -1; }
  if (thisblk.is_valid == 0) { return -1; }
  if (this.solution == null) { return -1; }

  //
  // validate hash is a proper solution
  //
  let ourPublicKey  = this.solution.pubkey;
  let prevBlockHash = prevblk.returnHash();
  let randomNumber  = this.solution.random;
  let hashValue     = this.app.crypt.hash(ourPublicKey + randomNumber);

  let decDifficulty = (prevblk.returnDifficulty() - Math.floor(prevblk.returnDifficulty()));
      decDifficulty = decDifficulty.toFixed(8);
  let intDifficulty = Math.floor(prevblk.returnDifficulty());

  let h1 = null;
  let h2 = null;

  if (intDifficulty == 0) {
    h1 = 1;
    h2 = 1;
  } else {
    h1 = hashValue.slice((-1 * intDifficulty));
    h2 = prevblk.returnHash().slice((-1 * intDifficulty));
  }

  if (h1 == h2) {

    let h3 = hashValue.toString().toLowerCase()[ourPublicKey.length-1-intDifficulty];
    let h4 = parseInt(h3,16);
    let intTheDiff = Math.floor((decDifficulty * 10000));
    let intModBase = 625;
    let intResult  = Math.floor((intTheDiff/intModBase));

    if (h4 >= intResult) {
    } else {
      console.log("Golden Ticket invalid - hash not low enough!");
      return 0;
    }
  } else {
    console.log("Golden Ticket does not validate - hash not low enough!");
    return 0;
  }

  //
  // validate signature (solution not stolen)
  //
  if (this.app.crypt.verifyMessage(this.returnSignatureSource(), this.solution.sig, this.solution.pubkey) == false) {
        console.log("Golden Ticket does not validate!");
        return 0;
  }

  //
  // this is essentially a copy of the code used to create the 
  // solution. If changes are needed see this.createSolution()
  //
  let burn_fee_needed = Big(prevblk.returnTransactionFeesNeededForThisBlock());
  let creator_surplus = Big(prevblk.returnTransactionFeesUsableForBlockCreatorSurplus());
  let total_surplus   = Big(prevblk.returnTransactionFeesTotalSurplus());
  //
  // total revenue to insert is BURN FEE + surplus not captured by block creator + COINBASE
  //
  let total_revenue = burn_fee_needed.plus(total_surplus).plus(Big(prevblk.block.coinbase)).minus(creator_surplus);
  let miner_share   = total_revenue.times(Big(prevblk.block.paysplit)).toFixed(8);
  let node_share    = total_revenue.minus(Big(miner_share)).toFixed(8);

  //
  // validate paysplit vote
  //
  if (this.solution.paysplit_vote != prevblk.returnPaysplitVote()) {
    console.log("Paysplit vote does not match previous block");
    return 0;
  }

  //
  // we cannot validate shares if 2nd last block is null
  //
  if (prevblk.block.prevhash == "" || prevblk.block.prevhash == null) {
    if (miner_share != this.solution.miner_share) {
      console.log("Miner Share does not equal what it should: "+miner_share + " -- " + this.solution.miner_share);
      return 0;
    }
    if (node_share != this.solution.node_share) {
      console.log("Node Share does not equal what it should: "+node_share + " -- " + this.solution.node_share);
      return 0;
    }
  }
  return 1;
}


/////////////////////////
// calculateDifficulty //
/////////////////////////
//
// validate monetary policy
//
// @params {string} treasury
// @params {string} coinbase
// @params {saito.block} previous block
// @returns {boolean} does validate?
//
GoldenTicket.prototype.validateMonetaryPolicy = function validateMonetaryPolicy(adjusted_treasury, adjusted_coinbase, prevblock) {

  let mp = this.calculateMonetaryPolicy(prevblock);

  if (mp[0] != adjusted_treasury) { 
    console.log("Treasury invalid: " + adjusted_treasury + " -- " + mp[0]);
    return 0;
  }
  if (mp[1] != adjusted_coinbase) { 
    console.log("Coinbase invalid: " + adjusted_coinbase + " -- " + mp[1]);
    return 0;
  }

  return 1;

}

