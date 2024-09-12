import type {HtmlNode} from "../index"

// get node's ancestor with the same level of indentation
export function getValidOpenedAncestor(node: HtmlNode, indentLevel: number): HtmlNode {
	if (node.nodeName === "main" || (node.nodeName === "li" && indentLevel >= (node.indentLevel as number))) {
		return node;
	}else {
		node.closed = true;
		return getValidOpenedAncestor(node.parentNode, indentLevel);
	}
}


// Returns the inner most open leaf block of a container block or the container block itself
export function getInnerMostOpenContainer(node:HtmlNode):HtmlNode{
	let multilineLeafBlocks = ["html block", "paragraph", "fenced code", "indented code block"];
	let lastChildNode = node.children[node.children.length - 1];
	if (!lastChildNode) {
		return node
	}else if (!lastChildNode.closed && !multilineLeafBlocks.includes(lastChildNode.nodeName)) {
		let potLeafBlock = getInnerMostOpenContainer(lastChildNode);
		if (!multilineLeafBlocks.includes(potLeafBlock.nodeName)) {
			return node
		}
		return potLeafBlock
	}else if (!lastChildNode.closed) {
		return lastChildNode;
	}
	return node;
}

// closes an opened node and return it's parent
export function closeNode(lastOpenedNode: HtmlNode) {
	const targets = ["paragraph", "html block", "blockquote"]
	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	if (!lastChild || (lastChild.nodeName === "html block" && lastChild.infoString !== "6") || lastChild.closed) {
		return false
	}else if (targets.includes(lastChild.nodeName)) {
		lastChild.closed = true // this implicitly closes every nested node too
		return true;
	}else {
		closeNode(lastChild)
	}
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


// TODO: refactor to prevent algorithm from looking for markers twice
export function getBlockNodes(line: string): [string, number] {
	let nodeName;
	let markerPos:number;

	if ((/^\s*>/).test(line)) {
		markerPos = line.indexOf('>');
		nodeName = "blockquote"
	}else if ((/^\s*#{1,6}\s/).test(line)) {
		markerPos = line.indexOf('#')
		nodeName = "header"
	}else if ((/^\s*`{3,}[^`]*$/).test(line)) {
		markerPos = line.indexOf('`');
		nodeName = "fenced code";
	}else if (lineIsHorizontalRule(line)){ // hr
		nodeName = "hr";
		markerPos = line.search(/\S/)
	}else if ((/^\s*</).test(line)) {
		nodeName = "html block"; // possibly
		markerPos = line.indexOf('<');
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