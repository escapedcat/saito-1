'use strict';

const saito = require('../saito');
const request = require('request');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const Big      = require('big.js');


/////////////////
// Constructor //
/////////////////
function Mempool(app) {

  if (!(this instanceof Mempool)) {
    return new Mempool(app);
  }

  this.app                        = app || {};

  this.data_directory             = path.join(__dirname, '../data/');

  this.transactions               = []; // array
  this.downloads                  = []; // queue fifo
  this.blocks                     = []; // queue fifo
  this.recovered                  = []; // array of recovered txs
					// used when reorgs affect
					// our old blocks

  // mempool safety caps
  //
  // temporary safety limits designed to help avoid
  // spam attacks taking down everyone in the network
  // by preventing propoagation past a certain point
  //
  this.transaction_size_cap       = 1024000000;// bytes hardcap 1GB
  this.transaction_size_current   = 0.0;
  this.block_size_cap             = 1024000000; // bytes hardcap 1GB
  this.block_size_current         = 0.0;
  this.download_size_cap          = 512000000; // bytes hardcap 1GB
  this.download_size_current      = 0.0;

  this.currently_processing       = 0;
  this.processing_timer           = null;
  this.processing_speed           = 50; // 0.1 seconds (add blocks)

  this.currently_downloading      = 0;
  this.downloading_timer          = null;
  this.downloading_speed          = 300; // 0.3 seconds

  this.currently_bundling         = 0;
  this.bundling_timer             = null;
  this.bundling_speed             = 400; // 0.4 seconds

  this.currently_clearing         = 0;   // 1 when clearing blks + txs
  this.currently_creating         = 0;   // 1 when creating a block from our txs
  this.bundling_fees_needed       = "-1";



  this.load_time                  = new Date().getTime();
  this.load_delay                 = 4000; // delay on startup so we have time
					  // to start reading from disk before
					  // we leap into block creation.


  if (this.bundling_speed < this.processing_speed) { this.bundling_speed = this.processing_speed+100; }

  return this;

}
module.exports = Mempool;


////////////////
// initialize //
////////////////
//
// start the loop to try and bundle blocks
//
Mempool.prototype.initialize = function initialize() {

  var mempool_self = this;

  if (mempool_self.app.BROWSER == 0 || mempool_self.app.SPVMODE == 0) {

    // use a timeout to get network class a 
    // bit of time to initialize. otherwise
    // we can have problems with calls to 
    // returnNumberOfPeers() etc.
    setTimeout(function() {
      mempool_self.startBundling();
    }, 1000);
  }

}


//////////////
// addBlock //
//////////////
//
// add block to mempool queue if it does not already exist
//
// n.b. if JSON use importBlock
//
// @returns {boolean} is successful?
//
Mempool.prototype.addBlock = function addBlock(blk) {
  if (blk == null) { return 0; }
  if (blk.is_valid == 0) { return 0; }

  //
  // spam check - TODO improve by having
  // more expensive blocks and txs replace less expensive ones
  //
  // tmp restriction to avoid memory-exhaustion attacks, designed to ensure
  // that nodes stop propagating garbage before it takes down the network
  //
  if ((this.block_size_current + blk.size) > this.block_size_cap) {
    return 0;
  }

  for (let i = 0; i < this.blocks.length; i++) {
    if (this.blocks[i].returnHash() == blk.returnHash()) { return 0; }
  }
  this.blocks.push(blk);
  this.block_size_current += blk.size;
  return 1;
}


////////////////////
// addTransaction //
////////////////////
//
// add transaction to mempool array if it does not already exist
//
// n.b. if JSON use importTransaction
//
Mempool.prototype.addTransaction = function addTransaction(tx, relay_on_validate=1) {

  let transaction_imported = 0;

  //
  // avoid adding if there is an obvious problem
  //
  if (this.containsTransaction(tx) == 1) { return; }
  if (tx == null)                        { return; }
  if (tx.transaction == null)            { return; }
  if (tx.is_valid == 0) 		 { return; }

  
  //
  // do not add if this pushes us past our limit
  //
  if ( (tx.size + this.transaction_size_current) > this.transaction_size_cap) {
    return;
  } 



  //
  // only accept one golden ticket
  //
  if (tx.transaction.gt != null) {
    for (let z = 0; z < this.transactions.length; z++) {
      if (this.transactions[z].transaction.gt != null) {

	//
	// ensure golden ticket is for the latest block
	//
        if (this.transactions[z].transaction.gt.target == this.app.blockchain.returnLatestBlockHash()) {

	  //
	  // if we already have a golden ticket solution, we will
	  // replace it with this new one if the new one pays us 
	  // more in fees and/or is going to pay us money.
	  //
          if (
   	    Big(tx.returnFeeUsable()).gt(Big(this.transactions[z].returnFeeUsable())) || (
	      this.transactions[z].transaction.from[0].add != this.app.wallet.returnPublicKey() && 
	      tx.transaction.from[0].add == this.app.wallet.returnPublicKey()
	    )
	  ) {
            this.transactions[z] = tx;
            transaction_imported = 1;
            z = this.transactions.length+1;
          } else {
            transaction_imported = 1;
          }
        } else {
          this.removeGoldenTicket();
        }
      }
    }
  }

  if (transaction_imported == 0) {
    var mempool_self = this;
    this.app.storage.validateTransactionInputsForMempool(tx, function(app, tx) {
      if (relay_on_validate == 1) {

	//
        // propagate if we can't use tx to create a block
	//
        if ( Big(mempool_self.bundling_fees_needed).gt(Big(tx.returnFeeUsable())) ) {

	  //
	  // add to mempool before propagating
	  // as propagateTransaction will check
	  //
          mempool_self.transactions.push(tx);
          mempool_self.transaction_size_current += tx.size;
          mempool_self.app.network.propagateTransaction(tx);
	  return;
        }
      }
      mempool_self.transactions.push(tx);
    });
  }
}


/////////////////
// bundleBlock //
/////////////////
//
// we believe we have enough fees to produce a block, so we 
// set the paysplit vote and bundle in the transactions we
// can, then submit the block to the block class to finalize.
//
// @params {saito.block} previous block
//
Mempool.prototype.bundleBlock = function bundleBlock(prevblk) {

  console.log("\n\n\nstart to bundle block:   " + (new Date().getTime()));

  //
  // creating a block requires DB access for things
  // like figuring out the reclaimed fees. this can
  // cause bad blocks to pile up in the creation process
  // at large data blocks, so we check to make sure
  // we are not already in the process of bundling
  // one before we try again....
  //
  if (this.currently_creating == 1) { return; }
  this.currently_creating = 1;

  //
  // create the block
  //
  var nb = new saito.block(this.app);
  if (nb == null || nb.is_valid == 0) {
    this.currently_creating = 0;
    return;
  }

  //
  // set the paysplit vote
  //
  nb.block.paysplit_vote = this.app.voter.returnPaysplitVote(prevblk.block.paysplit);
  
  //
  // set miner (needed to validate tx fees
  //
  nb.block.miner = this.app.wallet.returnPublicKey();

  //
  // set prevhash -- needed to calculate surplus fees
  //
  if (prevblk != null) {
    console.log("ADDING PREVHASH: " + prevblk.returnHash());
    nb.block.prevhash = prevblk.returnHash();
  }



  //
  // add mempool transactions
  //
  for (let i = 0; i < this.transactions.length; i++) {
    let addtx = 1;
    if (this.transactions[i].transaction.gt != null) { 

      //
      // this will happen if we run into a Golden Ticket for an older
      // block. we do not want to include this as it will make our
      // block invalid.
      //
      // this GT will be removed from our mempool automatically the 
      // next time we receive a golden ticket from someone else.
      //
      if (this.transactions[i].transaction.gt.target != prevblk.returnHash()) { 
        addtx = 0; 
      } 
    }
    if (nb.paysplit_vote == -1) {
      if (this.transactions[i].transaction.ps == 1) { 
	addtx = 0;
      }
    }
    if (nb.paysplit_vote == 1) {
      if (this.transactions[i].transaction.ps == -1) { 
	addtx = 0;
      }
    }
    if (addtx == 1) { 
      nb.addTransaction(this.transactions[i]); 
    }
  }

  //
  // add fee-capture transaction
  //
  // we use "Usable Surplus" because we expect all transactions
  // in our mempool to be either path-free (originating from us)
  // or signed and sent to us.
  //
  let my_fees    = Big(nb.returnTransactionFeesUsableForBlockCreatorSurplusForThisBlock());
console.log("FEES TO CREATE SURPLUS: " + my_fees);
  if (my_fees == null) { my_fees = Big(0.0); }
  if (my_fees.gte(0)) {
    var tx2 = this.app.wallet.createFeeTransaction(my_fees.toFixed(8));
console.log("\nFEE TRANSACTION: ");
console.log(JSON.stringify(tx2.transaction));
    nb.addTransaction(tx2);
  }

  nb.bundleBlock(prevblk);
  return;

}


//////////////////
// clearMempool //
//////////////////
//
// remove block and its transactions from mempool
//
// @params {saito.block} block to delete
//
Mempool.prototype.clearMempool = function clearMempool(blk) {
  if (blk == null) { return; }
  this.currently_clearing = 1;
  for (let bt = blk.transactions.length-1; bt >= 0; bt--) {
    this.removeTransaction(blk.transactions[bt]);
  }
  this.removeBlock(blk);
  this.currently_clearing = 0;
}


//////////////////////////
// containsGoldenTicket //
//////////////////////////
//
// return 1 if mempool already contains this transaction
//
// @params {saito.transaction} transaction to check
// @returns {boolean} is transaction in mempool?
//
Mempool.prototype.containsGoldenTicket = function containsGoldenTicket() {
  for (let m = 0; m < this.transactions.length; m++) {
    if (this.transactions[m].isGoldenTicket() == 1) { return 1; }
  }
  return 0;
}


/////////////////////////
// containsTransaction //
/////////////////////////
//
// return 1 if mempool already contains this transaction
//
// @params {saito.transaction} transaction to check
// @returns {boolean} is transaction in mempool?
//
Mempool.prototype.containsTransaction = function containsTransaction(tx) {

  if (tx == null)             { return 0; }
  if (tx.transaction == null) { return 0; }

  //
  // TODO
  //
  // if we insert the transactions into the array based on their sig
  // data we can optimize searching through the mempool once it is 
  // sizeable. another option might be using a hashmap to search.
  //
  // we check by looking for the signature of the transaction, as that
  // will be unique to each transaction and not influenced by the path
  // it has travelled to us from.
  //
  for (let mtp = 0; mtp < this.transactions.length; mtp++) {
    if (this.transactions[mtp].transaction.sig == tx.transaction.sig) {
      return 1;
    }
  }
  return 0;
}


////////////////
// fetchBlock //
////////////////
//
// after a peer informs us that a block is
// available, we come here to fetch it and 
// add it to our queue as needed.
//
Mempool.prototype.fetchBlock = function fetchBlock(peer, block_hash) {

  var mempool_self = this;

  //
  // check download NOT in progress
  //
  for (let i = 0; i < mempool_self.downloads.length; i++) {
    if (mempool_self.downloads[i].bhash == block_hash) { return; }
  }

  //
  // check not already indexed
  //
  // sanity check - is also done in peer class
  //
  if (mempool_self.app.blockchain.isHashIndexed(block_hash) == 1) { return; }

  //
  // queue download
  //
  var mdl       = mempool_self.downloads.length;
  var md2       = {};
      md2.peer = peer;
      md2.bhash = block_hash;
  mempool_self.downloads.push(md2);

  //
  // start timer and go through queue
  //
  if (mempool_self.downloading_timer == null) {
    mempool_self.downloading_timer = setInterval(function() {

      if (mempool_self.downloads.length == 0) {
        clearInterval(mempool_self.downloading_timer);
        mempool_self.downloading_timer = null;
        mempool_self.currently_downloading = 0;
      }
      if (mempool_self.currently_downloading == 1) { return; }
      mempool_self.currently_downloading = 1;


      //
      // check that we have space in our mempool for this block
      //
      // TODO
      //
      // there is a possible attack by making the downloaded file large
      // enough that it alone crashes the system. we should mitigate 
      // this.
      //
      try {
        if (mempool_self.block_size_current <= mempool_self.block_size_cap) {

          let dlblk      = mempool_self.downloads[0];
          let dlblk_url  = "http://" + dlblk.peer.peer.host + ":" + dlblk.peer.peer.port + "/blocks/" + dlblk.bhash;

          //
          // servers
          //
          if (mempool_self.app.BROWSER == 0) {

            var requestSettings = {
              url: dlblk_url,
              method: 'GET',
              timeout: 5000,			// remove from queue if not received in 5 seconds
              encoding: null
            }
            request(requestSettings, function(err, res, body) {
              if (err) {

		// remove failed download
		console.log("Failed Download of Block from Queue: " + err);
                mempool_self.downloads.splice(0, 1);
                mempool_self.currently_downloading = 0;

	      }

	      //
	      // we seem to have got something
	      //
              mempool_self.downloads.splice(0, 1);
              mempool_self.currently_downloading = 0;
	      var newblk = new saito.block(mempool_self.app, body);
	      newblk.originating_peer = dlblk.peer.peer.publickey;

	      //
	      // confirm is accurate
	      //
	      if (newblk.returnHash() != dlblk.bhash) { return; }
              if (newblk == null) { return; }
              if (newblk.is_valid == 0) { return; }
              mempool_self.app.blockchain.validateBlockAndQueueInMempool(newblk,1);
            });

          //
          // browsers
          //
          } else {

            //
	    // browsers use AJAX jquery
            //
            $.get(
              dlblk_url, {
              },function (data) {
	        var newblk = new saito.block(mempool_self.app, data);
                mempool_self.downloads.splice(0, 1);
                mempool_self.currently_downloading = 0;
                if (newblk == null) { return; }
                if (newblk.is_valid == 0) { return; }
                mempool_self.app.blockchain.validateBlockAndQueueInMempool(newblk,1);
              }
            );
          }

        } // mempool capacity check

      //
      // in event of error, remove bad block
      //
      } catch (err) {
        mempool_self.downloads.splice(0, 1);
        mempool_self.currently_downloading = 0;
      }
    }, mempool_self.downloading_speed);
  }
}


/////////////////
// importBlock //
/////////////////
//
// create block from json and add to mempool
//
// @params {string} block as json
// @returns {boolean} successful ?
//
Mempool.prototype.importBlock = function importBlock(blkjson) {
  var blk = new saito.block(this.app, blkjson);
  if (blk == null) { return 0; }
  if (blk.is_valid == 0) { return 0; }
  return this.addBlock(blk);
}


///////////////////////
// importTransaction //
///////////////////////
//
// create transaction from json and add to mempool
//
// @params {string} transaction as json
//
Mempool.prototype.importTransaction = function importTransaction(txjson) {
  var tx = new saito.transaction(txjson);
  if (tx == null) { return; }
  if (tx.is_valid == 0) { return; }
  this.addTransaction(tx);
}


///////////////////
// processBlocks //
///////////////////
//
// if there are any blocks in our mempool, we try to add
// them to the blockchain one-by-one.
//
Mempool.prototype.processBlocks = function processBlocks() {

console.log("mempool - process blk:   " + (new Date().getTime()));

  if (this.currently_processing == 1) { 
    console.log("Mempool processing.... not adding new block to blockchain");
    return; 
  }

  if (this.blocks.length == 0) {
    console.log("Mempool processing.... no blocks to add to blockchain");
    this.currently_processing = 0;
    return;
  }

  var mempool_self = this;

  if (this.processing_timer == null) {
    this.processing_timer = setInterval(function() {

      if (mempool_self.currently_clearing == 1) { return; }

      if (mempool_self.currently_processing == 1) { return; }
      mempool_self.currently_blocks = 1;


      if (mempool_self.blocks.length == 0) {
        mempool_self.currently_processing = 0;
        return;
      }

console.log("mempool - process blk2:  " + (new Date().getTime()));

      // FIFO adding from our queue
      var blk = mempool_self.returnBlock();
      if (blk == null) { 
	mempool_self.currently_processing = 0;
        return;
      }

      // add and delete block unless we get kickback
      if (blk != null) {
        var delete_blk_from_mempool = 0;
        if (blk.prevalidated == 0) {
          delete_blk_from_mempool = mempool_self.app.blockchain.addBlockToBlockchain(blk);
	} else {
          delete_blk_from_mempool = mempool_self.app.blockchain.addBlockToBlockchain(blk, "force");
	}
        if (delete_blk_from_mempool == 1) {
          mempool_self.clearMempool(blk);
        }
      }

      // if we have emptied our queue
      if (mempool_self.blocks.length == 0) {
        clearInterval(mempool_self.processing_timer);
        mempool_self.processing_timer = null;
      }

      mempool_self.currently_processing = 0;

    }, mempool_self.processing_speed);
  }
}


////////////////////////
// recoverTransaction //
////////////////////////
//
// when the chain is reorganized, any nodes that created
// transactions on the outdated chain will look to see what
// transactions are still valid and add them to their mempool
// this provides some continuity over reorgs.
//
// @params {saito.transaction} tx
//
Mempool.prototype.recoverTransaction = function recoverTransaction(tx) {

  var mempool_self = this;

  if (tx == null) { return; }
  if (tx.is_valid == 0) { return; }

  mempool_self.recovered.push(tx);

}


////////////////////////
// recoverTransaction //
////////////////////////
//
// when the chain is reorganized, any nodes that created
// transactions on the outdated chain will look to see what
// transactions are still valid and add them to their mempool
// this provides some continuity over reorgs.
//
// @params {saito.transaction} tx
//
Mempool.prototype.reinsertRecoveredTransactions = function reinsertRecoveredTransactions() {

  var mempool_self = this;

  if (mempool_self.recovered.length == 0) { return; }

  //
  // loop through recovered, getting txs
  //
  while (mempool_self.recovered.length > 0) {
    var tx2insert = mempool_self.recovered[0];
    mempool_self.recovered.splice(0, 1);

    if (tx2insert.transaction.gt == null && tx2insert.transaction.ft == null) {
      // 0 = do not relay on validate
      mempool_self.addTransaction(tx2insert, 0);
    }
  }

  //
  // should already be empty
  //
  mempool_self.recovered = [];

}


/////////////////
// removeBlock //
/////////////////
//
// remove block from mempool if exists
//
// @params {saito.block} block_to_remove
//
Mempool.prototype.removeBlock = function removeBlock(blk) {
  if (blk == null) { return; }
  for (let b = this.blocks.length-1; b >= 0; b--) {
    if (this.blocks[b].returnHash() == blk.returnHash()) {
      this.block_size_current -= this.blocks[b].size;
      this.blocks.splice(b, 1);
    }
  }
}


////////////////////////////////
// removeBlockAndTransactions //
////////////////////////////////
//
// removes block and its transactions from mempool
//
// @params {saito.block} block
//
Mempool.prototype.removeBlockAndTransactions = function removeBlockAndTransactions(blk) {
  if (blk == null) { return; }
  for (let b = 0; b < blk.transactions.length; b++) {
    this.removeTransaction(blk.transactions[b]);
  }
  this.removeBlock(blk);
}


////////////////////////
// removeGoldenTicket //
////////////////////////
//
// removes Golden Ticket from mempool
//
Mempool.prototype.removeGoldenTicket = function removeGoldenTicket() {
  for (let i = this.transactions.length-1; i >= 0; i--) {
    if (this.transactions[i].transaction.gt != null) {
      this.removeTransaction(this.transactions[i]);
      return;
    }
  }
}


//////////////////////////
// removeFeeTransaction //
//////////////////////////
//
// remove transaction from mempool if exists
//
Mempool.prototype.removeFeeTransaction = function removeFeeTransaction() {
  for (let t = this.transactions.length-1; t >= 0; t--) {
    if (this.transactions[t].transaction.ft != null) {
      this.transaction_size_current -= this.transactions[t].size;
      this.transactions.splice(t, 1);
    }
  }
}


///////////////////////
// removeTransaction //
///////////////////////
//
// remove transaction from mempool if exists
//
// @params {saito.transaction} tx_to_remove
//
Mempool.prototype.removeTransaction = function removeTransaction(tx) {
  if (tx == null) { return; }
  for (let t = this.transactions.length-1; t >= 0; t--) {
    if (this.transactions[t].transaction.sig == tx.transaction.sig) {
      this.transaction_size_current -= this.transactions[t].size;
      this.transactions.splice(t, 1);
    }
  }
}


/////////////////
// returnBlock //
/////////////////
//
// returns next block to process
//
// @returns {saito.block} block
//
Mempool.prototype.returnBlock = function returnBlock() {
  if (this.blocks.length == 0) { return null; }
  var tmpblk = this.blocks[0];
  return tmpblk;
}


//////////////////////////////
// returnBundlingFeesNeeded //
//////////////////////////////
//
// return fees needed to produce a block. used when
// checking if a new transaction pushes us over the edge
//
// @returns {string} bundling_fees_needed
//
Mempool.prototype.returnBundlingFeesNeeded = function returnBundlingFeesNeeded() {
  return this.bundling_fees_needed;
}


///////////////////////////////////////
// returnNormalTransactionsInMempool //
///////////////////////////////////////
//
// return total number of non golden-ticket transactions
// in the mempool.
//
// @returns {integer} num of txs
//
Mempool.prototype.returnNormalTransactionsInMempool = function returnNormalTransactionsInMempool() {
  var v = 0;
  for (let i = 0; i < this.transactions.length; i++) {
    if (this.transactions[i].transaction.gt == null) { v++; }
  }
  return v;
}


/////////////////////////////////
// returnUsableTransactionFees //
/////////////////////////////////
//
// returns the total value of the transaction fees in the 
// mempool that can be used to produce a block with a 
// certain paysplit vote.
//
// @params {integer} paysplit_vote
// returns {string} value;
//
Mempool.prototype.returnUsableTransactionFees = function returnUsableTransactionFees(paysplit_vote=0) {


  var v = Big(0);
  for (let i = 0; i < this.transactions.length; i++) {
    if (paysplit_vote == -1) {
      if (this.transactions[i].transaction.ps <= 0) {
        v = v.plus(Big(this.transactions[i].returnFeeUsableForBlockCreator(this.app, this.app.wallet.returnPublicKey())));
      }
    }
    if (paysplit_vote == 0) {
      v = v.plus(Big(this.transactions[i].returnFeeUsableForBlockCreator(this.app, this.app.wallet.returnPublicKey())));
    }
    if (paysplit_vote == 1) {
      if (this.transactions[i].transaction.ps >= 0) {
        v = v.plus(Big(this.transactions[i].returnFeeUsableForBlockCreator(this.app, this.app.wallet.returnPublicKey())));
      }
    }
  }
  return v.toFixed(8);
}


///////////////////
// startBundling //
///////////////////
//
// start our loop that attempts to bundle blocks
//
Mempool.prototype.startBundling = function startBundling() {

  if (this.currently_bundling == 1) { return; }

  var mempool_self = this;

  this.bundling_timer = setInterval(function() { mempool_self.tryToBundleBlock(); }, this.bundling_speed);

}


//////////////////
// stopBundling //
//////////////////
//
// stop trying to bundle blocks
//
Mempool.prototype.stopBundling = function stopBundling() {
  clearInterval(this.bundling_timer);
  this.currently_bundling = 0;
}


//////////////////////
// tryToBundleBlock //
//////////////////////
//
// bundling a block is the process of taking the transactions in 
// our mempool and putting them in a block that will validate. the
// first step in this process is checking to see if we have enough
// transactions to actually produce a valid block.
//
// if we do have enough transactions, we will create the block and
// then send it to the block class where it will be completed. the
// process for adding a block is basically:
//
//   Mempool    --> tryToBundleBlock
//   Mempool    --> bundleBlock
//   Block      --> bundleBlock
//   Mempool    --> addBlock
//   Mempool    --> processBlock
//   Blockchain --> addBlockToBlockchain
//
Mempool.prototype.tryToBundleBlock = function tryToBundleBlock() {

  var mempool_self = this;
  var block_paysplit_vote = 0;
  var latestBlk = null;

  //
  // check we can bundle a block
  //
  if (mempool_self.app.monitor.readyToBundleBlock() == 1) {

    //
    // fetch the block we are building atop
    //
    var latestBlk = mempool_self.app.blockchain.returnLatestBlock();
    if (latestBlk == null) { 
      latestBlk = new saito.block(mempool_self.app); 
      latestBlk.block.id = 0; 
    } else {
      block_paysplit_vote = mempool_self.app.voter.returnPaysplitVote(latestBlk.block.paysplit);
    }

    //
    // calculate fees available
    //
    let fees_needed = Big(0);
    let fees_available = Big(mempool_self.returnUsableTransactionFees(block_paysplit_vote));
    if (fees_available.lt(0)) { fees_available = Big(0); }

    //
    // calculate fees needed
    //
    if (latestBlk != null) {
      let unixtime_original = mempool_self.app.blockchain.returnUnixtime(latestBlk.returnHash());
      let unixtime_current = new Date().getTime();
      let milliseconds_since_block = unixtime_current - unixtime_original;
      fees_needed = Big(latestBlk.returnBurnFee()).minus(Big(Big(latestBlk.returnFeeStep()).times(Big(milliseconds_since_block))));
      if (fees_needed.lt(0)) { fees_needed = Big(0); }
    }

    mempool_self.bundling_fees_needed = fees_needed.minus(fees_available).toFixed(8);

    console.log((new Date()) + ": " + fees_needed.toFixed(8) + " ---- " + fees_available.toFixed(8) + " " + mempool_self.bundling_fees_needed + " (" + mempool_self.transactions.length + "/"+mempool_self.returnNormalTransactionsInMempool()+" -- "+mempool_self.app.wallet.returnBalance()+")");

    //
    // can we bundle a block? 
    //
    if (Big(mempool_self.bundling_fees_needed).lte(0)) {

      ////////////////
      // FREE block //
      ////////////////
      //
      // to avoid flooding, we only let nodes create a free
      // block for the money if they are not connected to any
      // other peers.
      //
      // otherwise they need at least one normal transaction
      //

//
// temporary for server, so it mints cash even if outdated nodes connected
//
if (mempool_self.app.wallet.returnBalance() < 100 && mempool_self.app.wallet.returnPublicKey() == "nR2ecdN7cW91nxVaDR4uXqW35GbAdGU5abzPJ9PkE8Mn") {} else {

      if (mempool_self.returnNormalTransactionsInMempool() == 0) {
        if (mempool_self.app.options.peers != null) {
          if (mempool_self.app.options.peers.length > 0) {
            if (mempool_self.app.options.server != null) {
              if (mempool_self.app.options.peers.length == 1 && mempool_self.app.options.peers[0].host == mempool_self.app.options.server.host) {} else { 
	        return;
	      }
            } else {
              return;
            }
          }
        }

	//
	// also check to make sure we do not have inbound-connections
	// so as not to flood the network with a free block if we have
	// just connected but others are connecting to us.
	//
	if (mempool_self.app.network.peers.length > 0) { return; }
      }


} // returnBalance

console.log("looks like we can bundle a block 2!");

      ///////////////////////////
      // NON-FREE block if ... //
      ///////////////////////////
      //
      // 1. we have a golden ticket or normal transaction
      //
console.log(mempool_self.containsGoldenTicket() + " + " + latestBlk.block.id + " + " + mempool_self.returnNormalTransactionsInMempool());
      if (mempool_self.containsGoldenTicket() == 0 && latestBlk.block.id != 0 && mempool_self.returnNormalTransactionsInMempool() == 0) { return; }

      //
      // 2. we are a full nodes or at least do not have NO blocks (to avoid flooding on boot)
      //
      if ( (mempool_self.app.BROWSER == 0 && mempool_self.app.SPVMODE == 0) || mempool_self.app.blockchain.index.hash.length > 0) {

        //
	// 3. and our mempool doesn't have blocks queued
	//
	if (mempool_self.blocks.length == 0) {
	  //
	  // UNCOMMENT FOR SPAMMER MODULE TESTING
	  // 
	  // if stress-testing the network, we need to make sure 
	  // we have enough time to generate a golden ticket in 
	  // order to avoid never generating new transaction slips.
	  //
	  if (mempool_self.containsGoldenTicket() == 1 || mempool_self.app.blockchain.index.hash.length == 0) {
          //
	    mempool_self.bundleBlock(latestBlk);
	  //
	  }
	  //
	}
      }
    }
  }
};


