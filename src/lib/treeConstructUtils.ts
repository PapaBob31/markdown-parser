import type {HtmlNode} from "../index"

// get node's ancestor with the same level of indentation
export function getValidOpenedAncestor(node: HtmlNode, indentLevel: number): HtmlNode {
	if (node.nodeName === "main" || (node.nodeName === "li" && indentLevel >= (node.indentLevel as number))) {
		return node;
	}else {
		return getValidOpenedAncestor(node.parentNode, indentLevel);
	}
}

// get node's list child with the same level of indentation as indentLevel
export function validListChild(node: HtmlNode, indentLevel: number): HtmlNode|null {
	if (node.nodeName === "li" && indentLevel - (node.indentLevel as number) >= 0 ) {
		return node;
	}else if (node.children.length === 0) {
		return null
	}else {
		let lastChild = node.children[node.children.length - 1]; // cause only the last child can still be opened
		return validListChild(lastChild, indentLevel);
	}
}

export function getInnerMostOpenContainer(node:HtmlNode):HtmlNode|null {
	if ((node.nodeName === "blockquote" || node.nodeName === "li") && !node.closed) {
		let lastChildNode = node.children[node.children.length - 1];
		if (lastChildNode && ["ul", "ol"].includes(lastChildNode.nodeName)){
			return getInnerMostOpenContainer(lastChildNode);
		}
		return lastChildNode;
	}// are the first 2 condition checks even necessary, ul and ol should always have children na abi?
	else if (node.nodeName === "ul" || node.nodeName === "ol" || node.nodeName === "main") { 
		if (!node.children[node.children.length - 1]) {
			return null
		}
		return getInnerMostOpenContainer(node.children[node.children.length - 1]);
	}else return null;
}

// closes an opened node and return it's parent
export function closeNode(lastOpenedNode: HtmlNode) {
	if (["blockquote", "html block", "paragraph"].includes(lastOpenedNode.nodeName)) {
		lastOpenedNode.closed = true;
		return lastOpenedNode.parentNode
	}else {
		let lastOpenedContainer = getInnerMostOpenContainer(lastOpenedNode);
		if (!lastOpenedContainer) {
			lastOpenedContainer = lastOpenedNode
		}
		let lastOpenedChild = lastOpenedContainer.children[lastOpenedContainer.children.length - 1]
		if (!lastOpenedChild) {
			return lastOpenedNode;
		}else if (lastOpenedChild.nodeName === "li" && lastOpenedChild.children.length === 0) { // blank lines shouldn't be nested inside list items twice
			lastOpenedNode = lastOpenedNode.parentNode.parentNode; // Don't want to stop at the ordered/unorderd list parent
		}else {
			closeNode(lastOpenedChild);
		}
	}
	return lastOpenedNode;
}

export function checkIfPartOfOtherNodeTypes(lastOpenedNode: HtmlNode, markerPos: number):string {
	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	if (lastChild && lastChild.nodeName === "fenced code" && !lastChild.closed) {
		return "fenced code"
	}else if (markerPos - (lastOpenedNode.indentLevel as number) >= 4) {
		return "indented code block"
	}
	return ""
}

function lineIsHorizontalRule(line: string) {
	const hrData = line.match(/^\s*(\*|-|_)(\s*\1\s*)*$/);
	let charCount = 0;
	if (!hrData) {
		return false
	}
	for (let char of line) {
		if (char === hrData[1]) {
			charCount++;
		}
		if (charCount === 3) return true;
	}

	return false
}

export function getBlockNodes(line: string): [string, number] {
	let nodeName;
	let markerPos = line.slice(0,4).indexOf('>');

	if (markerPos > -1) {
		nodeName = "blockquote"
	}else if ((/\s*#{1,6}\s/).test(line)) {
		markerPos = line.indexOf('#')
		nodeName = "header"
	}else if ((/^\s*`{3,}[^`]*$/).test(line)) {
		markerPos = line.indexOf('`');
		nodeName = "fenced code";
	}else if (lineIsHorizontalRule(line)){ // hr
		nodeName = "hr";
		markerPos = line.search(/\S/)
	}else if ((markerPos = line.search(/<\/?(?:\w|\d)./)) !== -1) {
		nodeName = "html block"; // possibly
	}else {
		let listMarkerDetails = (/^(\s*)(\d{1,9}(?:\.|\)))(\s+)/).exec(line) || (/^(\s*)(-|\+|\*)(\s+)/).exec(line);
		if (listMarkerDetails) {
			markerPos = listMarkerDetails[1].length;
			if (("+-*").includes(listMarkerDetails[2])) {
				nodeName = "ul-li"
			}else nodeName = "ol-li";
		}else {
			nodeName = "plain text";
			markerPos = line.search(/\S/);
		};
	}
	
	return [nodeName, markerPos];
}