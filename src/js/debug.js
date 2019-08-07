function assert(condition, error) {
	if (!condition) throw new Error(error);
}

function tree_debug_mixin(tree) {
	let debugData = tree.debug();
	let index = debugData.map;
	let linear = debugData.array;

	function countOccurrences(tarId, source) {
		let sum = 0;

		if (source.id == tarId) {
			sum += 1;
		}

		for (let i in source.childNodes) {
			sum += countOccurrences(tarId, source.childNodes[i]);
		}
		return sum;
	}

	function parentCheck(node) {
		if (node.id == -1)
			return;

		if (node.parentId == null || node.parent == null)
			throw new Error(`Node was missing parentId ${nodeparentId} or parent ${node.parent}`)

		if (node.parent.id != node.parentId)
			throw new Error(`Node ${node.id} had parentId of ${node.parentId}, but parent had id ${node.parent.id}`);

		if (node.parentId == node.id)
			throw new Error(`Node ${node.id} is parented to ittree`);
	}

	function parentChildCheck(origin) {
		for (let i in origin.childNodes) {
			let node = origin.childNodes[i];

			if (node.parentId != origin.id) {
				throw new Error(`Parent with ID ${origin.id} is not set as the parent of ${node.id} (parent marked as ${node.parentId} instead).`);
			}
			parentChildCheck(node);
		}
	}

	function childParentcheck(node) {
		if (node.id == -1) {
			return;
		}
		let parentNode = tree.get(node.parentId);
		if (parentNode == null) throw new Error(`Node ${node.id} has parent ${node.parentId}, but couldn't find this parent node.`);
		if (!parentNode.childNodes.includes(node)) throw new Error(`Node ${node.id} has parent ${node.parentId}, but ${node.id} wasn't listed as one of the children.`);
	}

	function validateInternalLinearity() {
		let n = linear.length;
		for (let i = 0; i < n; i++) {
			let cur = tree.getIndexed(i);
			if (cur == null) throw new Error(`Gap in linear index at ${i}`);
			if (i != cur.index) throw new Error(`Node ${cur.id} at linear index ${i} points to linear index ${cur.index}`);
		}
	}

	tree.linearIndex = function (id) {
		let indexFound = false;
		let counter = -1;

		function findLinearIndex(node) {
			if (node.id == id) {
				indexFound = true;
				return;
			}

			if (indexFound) return;
			counter++;
			node.childNodes.forEach(findLinearIndex);
		}

		findLinearIndex(tree.get(-1), id);

		return indexFound ? counter : -1;
	}

	tree.nodeAtLinIn = function (tar) {
		let counter = -1;
		let nodeFound = null;

		function nodeAtLinIn(node, tar) {
			if (counter == tar) {
				nodeFound = node;
				return;
			}

			counter++;

			for (let i in node.childNodes) {
				nodeAtLinIn(node.childNodes[i], tar);
				if (nodeFound) return;
			}
		}

		nodeAtLinIn(tree.get(-1), tar);
		return nodeFound;
	}

	tree.treeSize = function (source) {
		let sum = 1;

		for (let i in source.childNodes) {
			sum += tree.treeSize(source.childNodes[i]);
		}

		return sum;
	}

	tree.size = function () {
		return tree.treeSize(tree.get(-1));
	}

	tree.length = function () {
		return Object.keys(index).length;
	}

	tree.validateLinearity = function() {
		if (tree.getIndexed(0) == null && CACHE.debug().windows[tree.windowId] == null) return;
		let tabs = CACHE.debug().windows[tree.windowId];
		let n = tabs.length;

		for (let i = 0; i < n; i++) {
			let tab = tabs[i];
			let id = tab.id;
			let index = tree.linearIndex(id);
			let node = tree.nodeAtLinIn(index);
			if (i != node.index) throw new Error(`Node of tab ${tab.id} ${tab.url} was at index ${node.index} compared to tab index ${tab.index}`);
			if (tree.getIndexed(i).id != id) throw new Error(`Expected node ${id} at index ${i}, got ${tree.getIndexed(i).id} instead.`);
			if (id != node.id) throw new Error(`Index: ${index}. Found node ${node.id}with actual linear index ${tree.linearIndex(node.id)}`);
			if (index != tab.index) throw new Error(`Tab ${id} ${tab.url} position ${tab.index} doesn't match linear pos ${index} in tree`);
		}
	}

	tree.validate = function () {
		for (let k in index) {
			let occ = countOccurrences(k, tree.get(-1));
			childParentcheck(tree.get(k));
			parentCheck(tree.get(k));

			assert(occ == 1, `Found ${occ} occurrences of node with pid ${k}`);
			assert(k == tree.get(k).id, `Incorrect node ${tree.get(k).id} was mapped to key ${k}`);
		}

		for (let i = 0; i < linear.length; i++) {
			let a = linear[i];
			assert(i == a.index, `Node ${a.id} index ${a.index} didn't match index in linear array ${i}`);
			let idx = tree.linearIndex(a.id);
			assert(i == idx, `Node ${a.id} was at index ${i}, but was at ${idx} when traversing tree`);
		}

		for (let i = 0; i < linear.length; i++) {
			let node = linear[i];
			let id = linear[i].id;
			let parentId = toId(CACHE.getValue(id, 'parentPid'));
			assert(parentId === node.parentId, `Node ${node.id} had parent ${node.parentId}, but cache had parent ${parentId}`);
		}

		validateInternalLinearity();
		tree.validateLinearity();
		parentChildCheck(tree.get(-1));
		if (tree.length() != tree.size()) throw new Error(`Nodes length ${nodes.length()} doesn't match the size ${nodes.size()}`);
	}
}

function printTree(src) {
	function format(num) {
		if (num < 10)
			return `00${num}`
		if (num < 100)
			return `0${num}`
		return num
	}

	let str = "tree: \n";

	let c = 0;
	function recurse(parent, depth) {
		for (let i in parent.childNodes) {
			str += `[${format(c++)}] `;
			let child = parent.childNodes[i];
			for (let k = 0; k < depth; k++) {
				str += '    ';
			}
			let tab = CACHE.get(child.id);

			str += `pid: ${child.id}, id: ${tab.id} ${tab.title} (${tab.url})\n`;

			recurse(child, depth + 1);
		}
	}

	recurse(src.get(-1), 0);

	str += "\n\n\n\nlinear: \n";

	let lin = src.debug().array;

	for (let i = 0; i < lin.length; i++) {
		let tab = CACHE.get(lin[i].id);
		str += `[${i}] pid: ${lin[i].id}, id: ${tab.id} ${tab.title} (${tab.url})\n`;
	}

	console.log(str);
}

async function RESET_TAB_DATA() {
	await CACHE.forEach((tab) => {
		CACHE.removeValue(tab.id, 'parentPid');
		CACHE.removeValue(tab.id, 'pid');
	});
}

async function VALIDATE_ALL() {
	for (let k in TREE) {
		let tree = TREE[k];
		if (!DEBUG_MODE && tree.validate == null) tree_debug_mixin(tree);
		tree.validate();
	}

	console.log(`Done.`);
}

async function VALIDATE_STORED_DATA() {
	await CACHE.forEach(async tab => {
		let sessionpid = await browser.sessions.getTabValue(tab.id, 'pid');
		let cachepid = CACHE.getValue(tab.id, 'pid');
		assert(sessionpid == cachepid,
			`Browser had ${sessionpid} stored as pid of ${tab.id} instead of ${cachepid}`);

		let sessionParent = await browser.sessions.getTabValue(tab.id, 'parentPid');
		let cacheParent = CACHE.getValue(tab.id, 'parentPid');
		assert(sessionParent == cacheParent,
			`Browser had ${sessionParent} stored as parent of ${tab.id} instead of ${cacheParent}`);
	});

	console.log(`Done.`);
}

async function SET_PERSISTENT_ID(value) {
	NEXT_PERSISTENT_ID = value;

	browser.storage.local.set({
		next_persistent_id: NEXT_PERSISTENT_ID
	});
}
