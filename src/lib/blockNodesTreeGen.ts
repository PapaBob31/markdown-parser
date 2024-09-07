import type {HtmlNode} from "../index"
import { getBlockNodes, getInnerMostOpenContainer, getValidOpenedAncestor, closeNode, checkIfPartOfOtherNodeTypes} from "./treeConstructUtils"

function getHeaderNodeObj(line: string, lastOpenedNode: HtmlNode): HtmlNode {
	let headerDetails = line.match(/(\s*)(#+)\s/) as RegExpMatchArray;
	let ph = headerDetails[1].length;
	let hl = headerDetails[2].length;
	if (hl > 6)
		return {parentNode: lastOpenedNode, nodeName: "paragraph", closed: false, textContent: line, children: []};
	return {parentNode: lastOpenedNode, nodeName: `h${hl}`, closed: true, textContent: line.slice(hl + ph), children: []}
}

function addLeafBlocksContent(lastOpenedNode: HtmlNode, nodeName: string, line: string) {
	if (nodeName === "header") {
		lastOpenedNode.children.push(getHeaderNodeObj(line, lastOpenedNode))
	}else if (nodeName === "hr") {
		lastOpenedNode.children.push({parentNode: lastOpenedNode, closed: true, nodeName, children: []})
	}else if (nodeName === "html block") {
		lastOpenedNode.children.push(
			{parentNode: lastOpenedNode, nodeName: "html block", closed: false, textContent: line, children: []}
		)
	}else if (nodeName === "plain text") {
		lastOpenedNode.children.push({parentNode: lastOpenedNode, nodeName: "paragraph", closed: false, textContent: line, children: []})
	}
}

function continueLeafBlocks(lastOpenedNode: HtmlNode, line: string, markerPos: number, nodeName: string):void {
	let lastOpenedContainer = getInnerMostOpenContainer(lastOpenedNode)
	let multilineLeafBlocks = ["html block", "paragraph", "fenced code"]
	
	if (markerPos - (lastOpenedNode.indentLevel as number) >= 4){
		if (lastOpenedContainer.nodeName === "indented code block") { // TO IMPLEMENT: Indented code blocks cannot interrupt paragraphs
			lastOpenedContainer.textContent += '\n' + line
		}else {
			lastOpenedNode.children.push({parentNode: lastOpenedNode, nodeName: "indented code block", closed: false, textContent: line, children: []})
		}
	}else if (nodeName === "fenced code") {
		addFencedCodeContent(lastOpenedNode, line)	
	}else if (!multilineLeafBlocks.includes(lastOpenedContainer.nodeName)){
		addLeafBlocksContent(lastOpenedContainer, nodeName, line)
	}else if (lastOpenedContainer.nodeName === "paragraph" && nodeName !== "plain text"){
		addLeafBlocksContent(lastOpenedContainer.parentNode, nodeName, line)
	}else {
		lastOpenedContainer.textContent += '\n' + line
	}
}

function addFencedCodeContent(lastOpenedNode: HtmlNode, line: string){
	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	let fenceDetails = line.match(/(`+)(.+)?/) as RegExpMatchArray;

	if (fenceDetails) {
		let fenceLength = fenceDetails[1].length
		if (!lastChild || lastChild.nodeName !== "fenced code") {
			let infoString = (fenceDetails[2] || "");
			lastOpenedNode.children.push(
				{parentNode: lastOpenedNode, nodeName: "fenced code", fenceLength, closed: false, textContent: "", infoString, children: []}
			)
		}else if (((lastChild.fenceLength as number) <= fenceLength) && !fenceDetails[2]) {
			lastChild.closed = true;
		}else lastChild.textContent += '\n' + line;
	}else {
		lastChild.textContent += '\n' + line;
	}
}

function addListItem(nodeName: string, lastOpenedNode: HtmlNode, line: string, markerPos: number) {
	let parentNodeName = ""; // list parent node name as in ordered or unordered
	if (nodeName === "ol-li") {
		parentNodeName = "ol"
	}else parentNodeName = "ul"

	let markerWidth;
	let listItemPattern = line.match(/(\s*)(\d{1,9}(\.|\)))(\s*)/) || line.match(/(\s*)(\*|\+|-)(\s*)/) as RegExpMatchArray;
	if (listItemPattern[3].length >= 4) {
		markerWidth = listItemPattern[2].length + 1;
	}else markerWidth = listItemPattern[2].length + listItemPattern[3].length;

	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	if (!lastChild || lastChild.nodeName !== parentNodeName) {
		let startNo = (parentNodeName === "ol" ? listItemPattern[2] : "");
		lastOpenedNode.children.push({parentNode: lastOpenedNode, nodeName: parentNodeName, closed: false, startNo, children: []})
		lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	}
	// indent level should temporarily be zero for text on the same line as the list marker to prevent wrong indent usage
	lastChild.children.push({parentNode: lastChild, nodeName: "li", indentLevel: 0, closed: false, children: []})
	lastOpenedNode = lastChild.children[lastChild.children.length - 1];

	let openedNestedNode:HtmlNode = parseLine(line.slice(markerPos + markerWidth), lastOpenedNode);
	lastOpenedNode.indentLevel = markerPos + markerWidth; // actual indent level to be used for nested nodes
	if (lastOpenedNode !== openedNestedNode) {
		lastOpenedNode = openedNestedNode;
	}
	return lastOpenedNode;
}

function getInnerMostOpenBlockQuote(node:HtmlNode):HtmlNode|null {
	let blockQuoteNode = null;
	if (node.closed) {
		return null
	}else if (node.nodeName === "blockquote") {
		blockQuoteNode = node
	}

	if (node.children.length === 0) {
		return blockQuoteNode
	}
	let temp = getInnerMostOpenBlockQuote(node.children[node.children.length-1])
	if (temp) {
		blockQuoteNode = temp;
	}
	return blockQuoteNode;
}

// TODO: backslash escapes, proper tab to spaces conversion, escape dangerous html
function parseLine(line: string, lastOpenedNode: HtmlNode) {
	if (line.search(/\S/) === -1) {
		// NOTE: list items blank lines parsing still buggy!
		if (lastOpenedNode.nodeName === "li" && lastOpenedNode.indentLevel !== 0 && lastOpenedNode.children.length === 0) { // blank lines shouldn't be nested inside list items twice
			lastOpenedNode = lastOpenedNode.parentNode.parentNode; // Don't want to stop at the ordered/unorderd list parent
		}else closeNode(lastOpenedNode);
	}

	let [nodeName, markerPos] = getBlockNodes(line);
	if (lastOpenedNode.nodeName === "li") {
		let lastOpenedContainer = getInnerMostOpenContainer(lastOpenedNode)
		if (nodeName !== "plain text" || lastOpenedContainer.nodeName !== "paragraph") {
			// to allow for paragraph continuation lines
			lastOpenedNode = getValidOpenedAncestor(lastOpenedNode, markerPos);	
		}
	}else if (lastOpenedNode.nodeName === "blockquote" && nodeName !== "plain text" && nodeName !== "blockquote") {
		lastOpenedNode.closed = true;
		lastOpenedNode = getValidOpenedAncestor(lastOpenedNode, markerPos);
	}

	if (!["ol-li", "ul-li", "blockquote"].includes(nodeName)) {
		continueLeafBlocks(lastOpenedNode, line, markerPos, nodeName);
	}else if (nodeName === "blockquote") {
		// every nested content may be part of a lazy continuation line
		let openedBlockQuote = getInnerMostOpenBlockQuote(lastOpenedNode)

		if (!openedBlockQuote || openedBlockQuote.nodeName !== "blockquote" || openedBlockQuote.closed) {
			lastOpenedNode.children.push(
				{parentNode: lastOpenedNode, nodeName: "blockquote", closed: false, indentLevel: lastOpenedNode.indentLevel+markerPos+1, children: []}
			)
			openedBlockQuote = lastOpenedNode.children[lastOpenedNode.children.length - 1]
		}
		let actualIndentLevel = openedBlockQuote.indentLevel
		openedBlockQuote.nodeName = "main"; // makes every nested node actually believe it's root
		openedBlockQuote.indentLevel = 0; // makes every nested node actually believe it's root

		parseLine(line.slice(markerPos+1), openedBlockQuote);

		openedBlockQuote.nodeName = "blockquote"; // restore to actual value
		openedBlockQuote.indentLevel = actualIndentLevel; // restore to actual value
		
	}else if (nodeName === "ol-li" || nodeName === "ul-li") {
		lastOpenedNode = addListItem(nodeName, lastOpenedNode, line, markerPos)
	}
	return lastOpenedNode;
}

export default function generateBlockNodesTree(textStream: string) {
	let rootNode:HtmlNode = {parentNode: null as any, nodeName: "main", indentLevel: 0, closed: false, children: []};
	let lastOpenedNode = rootNode;
	const lines = textStream.split('\n');

	for (let line of lines) {
		lastOpenedNode = parseLine(line, lastOpenedNode);
	}

	return rootNode;
}