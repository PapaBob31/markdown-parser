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

export function getInnerMostOpenContainer(node:HtmlNode):HtmlNode{
	let lastChildNode = node.children[node.children.length - 1];
	if (lastChildNode && !lastChildNode.closed && ["ul", "ol", "blockquote", "li"].includes(lastChildNode.nodeName)){
		return getInnerMostOpenContainer(lastChildNode);
	}else if (lastChildNode && !lastChildNode.closed) {
		return lastChildNode;
	}else {
		return node;
	}
}

// closes an opened node and return it's parent
export function closeNode(lastOpenedNode: HtmlNode) {
	const targets = ["paragraph", "html block", "blockquote"]
	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	if (!lastChild || lastChild.closed) {
		return
	}else if (targets.includes(lastChild.nodeName)) {
		lastChild.closed = true // every nested node should get closed too
	}else {
		closeNode(lastChild)
	}
	if (lastOpenedNode.nodeName === "li" && lastOpenedNode.children.length === 0) { // TODO: blank lines shouldn't be nested inside list items twice
		lastOpenedNode = lastOpenedNode.parentNode.parentNode; // Don't want to stop at the ordered/unorderd list parent
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

export function getBlockNodes(line: string): [string, number] {
	let nodeName;
	let markerPos = line.slice(0,4).indexOf('>');

	if (markerPos > -1) {
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