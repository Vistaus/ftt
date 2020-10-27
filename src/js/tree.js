class TreeStructure {
	constructor() {
		this.map = {};
		this.array = [];
		this.map[-1] = {
			id: -1
			, parentId: null
			, parent: null
			, childNodes: []
			, index: -1
		};
		this.recordDeltas = false;
		this.jt = new JumpTable();
	}

	debug() {
		return {
			map: this.map,
			array: this.array
		}
	}

	beginRecord() {
		this.recordDeltas = true;
		this.deltas = [];
	}

	endRecord() {
		this.recordDeltas = false;
		return this.deltas;
	}

	asDeltas() {
		let ret = [];

		this.array.forEach(node => ret.push({
			id: node.id,
			parentId: node.parentId,
			index: node.index
		}));

		return ret;
	}

	get(id) { return this.map[id]; }

	getIndexed(i) { return this.array[i]; }

	ancestorIds(id) {
		let node = this.map[id];
		let ancestors = [];

		while (node.parentId != null) {
			node = node.parent;
			ancestors.push(node.id);
		}

		return ancestors;
	}

	subtreeArray(id) {
		let root = this.map[id];
		let ids = [];

		function recurse(node) {
			ids.push(node.id);

			node.childNodes.forEach(child => {
				recurse(child);
			});
		}

		recurse(root);
		return ids;
	}

	findLastDescendant(id) {
		let node = this.map[id];

		let a = node.index - 1;
		let h = this.array.length * 2;
		do {
			h = Math.ceil(h / 2);
			if (a + h < this.array.length) {
				let temp = this.jt.lca(id, this.array[a + h].id);
				if (temp == id) a += h;
			}
		} while(h > 1);

		while (node.childNodes.length > 0)
			node = node.childNodes[node.childNodes.length - 1];

		if (this.array[a].id != node.id)
			throw (`Last descendant was ${node.id}, binsrch yield ${this.array[a].id}`);

		return node.id;
	}

	__binsrch(srch, t) {
		let a = 0;
		let b = t.length;
		if (b == 0) return -1;

		while(a < b) {
			let k = Math.floor((a + b) / 2);
			let comp = t[k].index;

			if (comp == srch) return k;
			if (comp < srch) a = k + 1;
			else b = k;
		}

		return a;
	}

	__binsrchchange(srch, t) {
		let a = -1;
		for (let h = t.length; h > 0; h = Math.floor(h / 2))
			while (a + h < t.length && t[a + h].index < srch)
				a += h;

		return a + 1;
	}

	__removeFrom(node, parent) {
		let i = this.__binsrch(node.index, parent.childNodes);
		if (i != -1) parent.childNodes.splice(i, 1);
	}

	buildDepths() {
		this.array.forEach(n => this.jt.depth(n.id));
	}

	move(id, toIndex) {
		let node = this.map[id];
		let fromIndex = node.index;

		if (fromIndex == toIndex) return;
		if (node.childNodes.length > 0) {
			throw new Error(`Cannot move a node with children`);
		}

		// Remove from parent here to make use of binary search
		// Nodes would be out of order after index correction otherwise
		this.__removeFrom(node, node.parent);
		node.parent = null;

		let displacedIndex = fromIndex < toIndex ? toIndex + 1 : toIndex;
		let parent;

		if (displacedIndex >= this.array.length) {
			parent = this.map[-1];
		} else {
			let displaced = this.array[displacedIndex];
			parent = displaced.parent;
		}

		this.array.splice(fromIndex, 1);
		this.array.splice(toIndex, 0, node);

		let a = Math.min(fromIndex, toIndex);
		let b = Math.max(fromIndex, toIndex) + 1;
		b = Math.min(b, this.array.length);

		for (let i = a; i < b; i++) this.array[i].index = i;

		this.__changeParent(node, parent);
	}

	changeParent(id, parentId) {
		let node = this.map[id];
		if (node.parentId == parentId) return;

		for (let i = node.index; i < this.map[this.findLastDescendant(id)].index + 1; i++)
			this.jt.invalidate(this.array[i].id);

		// todo: check if parent is legal
		let parent = this.map[parentId];
		this.__changeParent(node, parent);
	}

	new(id) {
		if (id == null) throw new Error(`Attempt to create a node with null id.`);
		if (this.map[id] != null) throw new Error(`Node ${id} already exists.`);

		let node = {
			id
			, childNodes: []
			, index: this.array.length
		};

		this.array.push(node);
		this.map[id] = node;

		this.jt.addNode(id, -1);
		this.__changeParent(node, this.map[-1]);
		return node;
	}

	__changeParent(node, parent) {
		if (node.parent != null) {
			let oldIndex = this.__binsrch(node.index, node.parent.childNodes);
			node.parent.childNodes.splice(oldIndex, 1);
		}

		node.parentId = parent.id;
		node.parent = parent;
		let children = parent.childNodes;

		let index = this.__binsrchchange(node.index, parent.childNodes);
		if (index < 0 || index >= children.length) children.push(node);
		else children.splice(index, 0, node);

		this.jt.setParent(node.id, parent.id);

		if (this.recordDeltas) this.deltas.push({
			id: node.id,
			parentId: parent.id,
			index: node.index
		});
	}

	promoteFirstChild(id) {
		let node = this.map[id];

		let children = node.childNodes;
		let n = children.length;
		if (n == 0) return;

		for (let i = node.index + 1; i < this.map[this.findLastDescendant(id)].index + 1; i++)
			this.jt.invalidate(this.array[i].id);

		let firstChild = children[0];
		firstChild.parentId = node.parentId;
		firstChild.parent = node.parent;
		let newChildren = firstChild.childNodes;

		for (let i = 1; i < n; i++) {
			let child = children[i];
			child.parentId = firstChild.id;
			child.parent = firstChild;
			newChildren.push(child);
		}

		if (this.recordDeltas) children.forEach(child => this.deltas.push({
			id: child.id,
			parentId: child.parentId,
			index: child.index
		}));

		node.childNodes = [];

		let parent = node.parent;
		let index = this.__binsrch(node.index, parent.childNodes);
		parent.childNodes.splice(index + 1, 0, firstChild);
	}

	remove(id) {
		let node = this.map[id];

		this.promoteFirstChild(node.id);
		this.jt.remove(id);
		let children = node.parent.childNodes;
		let indexInParent = this.__binsrch(node.index, node.parent.childNodes);
		children.splice(indexInParent , 1);

		this.array.splice(node.index, 1);
		let n = this.array.length;
		let i = node.index;
		while (i < n) this.array[i++].index--;

		delete this.map[id];
	}
}
