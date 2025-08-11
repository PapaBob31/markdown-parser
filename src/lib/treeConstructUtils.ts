import type {HtmlNode} from "../index"

/** Indentation is one of the ways to create parent-child relations in markdown
 *  Return node's ancestor with the same indentLevel attribute as the indentLevel parameter  */
export function getValidOpenedAncestor(node: HtmlNode, indentLevel: number): HtmlNode {
	if (node.nodeName === "root" || (node.nodeName === "li" && indentLevel >= (node.indentLevel as number))) {
		return node;
	}else {
		node.closed = true;
		return getValidOpenedAncestor(node.parentNode, indentLevel);
	}
}


// Returns the inner most open leaf block of a container block or the container block itself
export function getInnerMostOpenContainer(node:HtmlNode):HtmlNode{
	let multilineLeafBlocks = ["html block", "paragraph", "fenced code backtick", "fenced code tilde", "indented code block", "table"];
	let lastChildNode = node.children[node.children.length - 1]; // only the last child of a node can be unclosed
	if (!lastChildNode) {
		return node
	}else if (!lastChildNode.closed && !multilineLeafBlocks.includes(lastChildNode.nodeName)) {
		let potLeafBlock = getInnerMostOpenContainer(lastChildNode); // potential leaf block node
		if (!multilineLeafBlocks.includes(potLeafBlock.nodeName)) {
			return node
		}
		return potLeafBlock
	}else if (!lastChildNode.closed) {
		return lastChildNode;
	}
	return node;
}

// Returns the first node in a node's descendants that can be closed by a blank line or
// returns the node itself if the node has no child
export function getFirstClosableChildNode(node: HtmlNode): any {
	const targets = ["paragraph", "html block", "blockquote", "table"]
	let lastChild = node.children[node.children.length - 1]; // only the last child of a node can be unclosed

	if (!lastChild || (lastChild && lastChild.closed)) {
		return node;
	}else if (lastChild.nodeName === "html block" && !["6", "7"].includes(lastChild.infoString)) {
		return null
	}else if (targets.includes(lastChild.nodeName)) { // doesn't matter if the node is already closed
		return lastChild;
	}else {
		return getFirstClosableChildNode(lastChild)
	}
}

// Checks if the content of a line represents a 'thematic break' as per GFM spec
function lineIsHorizontalRule(line: string) {
	const hrData = line.match(/\*|-|_/);
	let charCount = 0;
	if (!hrData) {
		return false
	}

	for (let char of line) {
		if (char === hrData[0]){
			charCount++;
		}else if (!(/\s/).test(char)) {
			return false;
		}
	}
	if (charCount < 3) return false;
	return true;
}

// Returns the position and the meaning of special markdown character found on a line
export function getLineSemantics(line: string): [string, number] {
	let markerMeaning;
	let markerPos:number;

	if ((/^\s*>/).test(line)) {
		markerPos = line.indexOf('>');
		markerMeaning = "blockquote"
	}else if ((/^\s*#{1,6}\s/).test(line)) {
		markerPos = line.indexOf('#')
		markerMeaning = "header"
	}else if ((/^\s*`{3,}[^`]*$/).test(line)) {
		markerPos = line.indexOf('`');
		markerMeaning = "fenced code";
	}else if ((/^\s*~{3,}[^~]*$/).test(line)) {
		markerPos = line.indexOf('~');
		markerMeaning = "fenced code";
	}else if (lineIsHorizontalRule(line)){
		markerMeaning = "hr";
		markerPos = line.search(/\S/)
	}else if ((/^\s*</).test(line)) {
		markerMeaning = "html block"; // possibly
		markerPos = line.indexOf('<');
	}else {
		let listMarkerDetails = (/^(\s*)(\d{1,9}(?:\.|\)))\s+/).exec(line) || (/^(\s*)(-|\+|\*)\s+/).exec(line);
		if (listMarkerDetails) {
			markerPos = listMarkerDetails[0].length-1;
			if (("+-*").includes(listMarkerDetails[2])) {
				markerMeaning = "ul-li"
			}else markerMeaning = "ol-li";
		}else {
			markerMeaning = "plain text";
			markerPos = line.search(/\S/);
		};
	}
	
	return [markerMeaning, markerPos];
}