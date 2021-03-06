'use strict';

var constants = require('../helpers/constants.js');
var VM = require('ethereumjs-vm');
var Trie = require('merkle-patricia-tree');
var rlp = require('rlp');
var ethAccount = require('ethereumjs-account');
const util = require('ethereumjs-util');

// Private fields
var self, modules, library;

// Constructor
function Contract () {
	self = this;
}


// Public methods
//
//__API__ `bind`

//
Contract.prototype.bind = function (scope) {
	modules = scope.modules;
	library = scope.library;
};

//
//__API__ `create`

//
Contract.prototype.create = function (data, trs) {
	trs.asset.code = data.code;

	return trs;
};

//
//__API__ `calculateFee`

//
Contract.prototype.calculateFee = function (trs) {
	return constants.fees.publishContract;
};

//
//__API__ `verify`

//
Contract.prototype.verify = function (trs, sender, cb) {

	// var isAddress = /^[1-9A-Za-z]{1,35}$/g;
	// if (!trs.recipientId || !isAddress.test(trs.recipientId)) {
	// 	return cb('Invalid recipient');
	// }

	// if(trs.recipientId != this.generateAddress(trs))
	// {
	// 	return cb('Invalid contract address');
	// }

	return cb(null, trs);
};

//
//__API__ `process`

//
Contract.prototype.process = function (trs, sender, cb) {

	// trs.recipientId = self.generateAddress(trs)

	return cb(null, trs);
};

//
//__API__ `getBytes`

//
Contract.prototype.getBytes = function (trs) {
	var buf;

	try {
		buf = trs.asset.code ? new Buffer(trs.asset.code, 'utf8') : null;
	} catch (e) {
		throw e;
	}

	return buf;
};

//
//__API__ `apply`

//
Contract.prototype.apply = function (trs, block, sender, cb) {
	
	var contractId = self.generateAddress(trs);

	trs.recipientId = contractId;

	var stateTrie = new Trie();
	stateTrie.state = stateTrie; // HACK!! we do this to fool stateManager constructor so it does not create a new SAFE trie which 
									// hash/double hash the storage keys. for now there is no other way of skiping the hashing besides
									// forking ethereumjs-vm
	var vm = new VM(stateTrie);

	var bytecode = trs.asset.code;
	var runtimeBytecode = '';
	var storage = [];

	vm.runCode({
		code: Buffer.from(bytecode, 'hex'),
		gasLimit: Buffer.from('ffffffffff', 'hex'),
		address: contractId
	}, function (err, res) {
		if(err)
			return cb(err);

		runtimeBytecode = res.return.toString('hex');

		res.runState.stateManager._getStorageTrie(res.runState.address, function (err, trie) {
			if(err)
				cb(err);

			var stream = trie.createReadStream();

			stream.on('data', function (dt) {
				var value = rlp.decode(dt.value).toString('hex');

				storage.push({
					key: dt.key.toString('hex'),
					value: value
				});
			})

			stream.on("end", done);
		});
	});
	
	function done() {

		var data = {
			address: contractId,
			blockId: block.id,
			code: runtimeBytecode,
			storage: JSON.stringify(storage)
		};

		library.logger.log("Deploying contract to blockchain: ", contractId);

		modules.accounts.setAccountAndGet(data, cb);
	}
};


//
//__API__ `undo`

//
Contract.prototype.undo = function (trs, block, sender, cb) {
	return cb();
};

//
//__API__ `applyUnconfirmed`

//
Contract.prototype.applyUnconfirmed = function (trs, sender, cb) {

	// should check address that comtract is not already deployed

	return cb();
};

//
//__API__ `undoUnconfirmed`

//
Contract.prototype.undoUnconfirmed = function (trs, sender, cb) {
	return cb();
};

// asset schema
Contract.prototype.schema = {
	id: 'contract',
	type: 'object',
	properties: {
		code: {
			type: 'string',
			format: 'hex'
		}
	},
	required: ['code']
};

//
//__API__ `objectNormalize`

//
Contract.prototype.objectNormalize = function (trs) {
	var report = library.schema.validate(trs.asset, Contract.prototype.schema);

	if (!report) {
		throw 'Failed to validate vote schema: ' + this.scope.schema.getLastErrors().map(function (err) {
			return err.message;
		}).join(', ');
	}

	return trs;
};

Contract.prototype.generateAddress = function(trs)
{
	return library.crypto.getContractAddress(library.logic.transaction.getBytes(trs, true, true));
}

//
//__API__ `dbRead`

//
Contract.prototype.dbRead = function (raw) {

	if (!raw.code) {
		return null;
	} else {
		var code = raw.code;

		return {code: code};
	}
};

Contract.prototype.dbTable = 'code';

Contract.prototype.dbFields = [
	'code',
	'transactionId'
];

//
//__API__ `dbSave`

//
Contract.prototype.dbSave = function (trs) {
	return {
		table: this.dbTable,
		fields: this.dbFields,
		values: {
			code: trs.asset.code,
			transactionId: trs.id
		}
	};
};

//
//__API__ `ready`

//
Contract.prototype.ready = function (trs, sender) {
	if (Array.isArray(sender.multisignatures) && sender.multisignatures.length) {
		if (!Array.isArray(trs.signatures)) {
			return false;
		}
		return trs.signatures.length >= sender.multimin;
	} else {
		return true;
	}
};


// Export
module.exports = Contract;


