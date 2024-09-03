import type {HtmlNode} from "../index"
import { getBlockNodes, validListChild, getInnerMostOpenContainer, getValidOpenedAncestor, closeNode, checkIfPartOfOtherNodeTypes} from "./treeConstructUtils"

function getHeaderNodeObj(line: string, lastOpenedNode: HtmlNode): HtmlNode {
	let headerDetails = line.match(/(\s*)(#+)\s/) as RegExpMatchArray;
	let ph = headerDetails[1].length;
	let hl = headerDetails[2].length;
	return {parentNode: lastOpenedNode, nodeName: `h${hl}`, textContent: line.slice(hl + ph), children: []}
}

function continueOpenedParagraph(lastOpenedNode: HtmlNode, line: string):boolean {
	let lastOpenedContainer = getInnerMostOpenContainer(lastOpenedNode) // incase lastOpenedNode is a blockquote
	if (!lastOpenedContainer) {
		lastOpenedContainer = lastOpenedNode
	}
	let lastChild = lastOpenedContainer.children[lastOpenedContainer.children.length - 1];
	if (lastChild && lastChild.nodeName === "paragraph" && !lastChild.closed) {
		lastChild.textContent += '\n' + line // paragraph continuation line
		return true;
	}
	return false;
}

function addFencedCodeContent(lastOpenedNode: HtmlNode, line: string){
	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	let fenceDetails = line.match(/(`+)(.+)?/) as RegExpMatchArray;

	if (fenceDetails) {
		let fenceLength = fenceDetails[1].length
		if (!lastChild || lastChild.nodeName !== "fenced code") {
			let infoString = (fenceDetails[2] || "");
			lastOpenedNode.children.push(
				{parentNode: lastOpenedNode, nodeName: "fenced code", fenceLength, closed: false, infoString, children: []}
			)
		}else if (((lastChild.fenceLength as number) <= fenceLength) && !fenceDetails[2]) {
			lastChild.closed = true;
		}else lastChild.textContent += '\n' + line;
	}else {
		lastChild.textContent += '\n' + line;
	}
}

function addIndentedCodeBlockContent(lastOpenedNode: HtmlNode, line: string) {
	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	if (lastChild.nodeName === "indented code block" && !lastChild.closed) {
		lastChild.textContent += '\n' + line;
	}else{
		// TODO: should the initial indented code block line be sliced?
		lastOpenedNode.children.push({parentNode: lastOpenedNode, nodeName: "indented code block", textContent:line, children: []})
	}
}

// function addHtmlBlockContent(htmlB: HtmlNode, line: string) {
// 	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length-1];
// 	if (!lastChild || lastChild.nodeName !== "html block" || lastChild.closed) {
// 		lastOpenedNode.children.push(
// 			{parentNode: lastOpenedNode, nodeName: "html block", closed: false, textContent: line, children: []}
// 		)
// 	}else lastChild.textContent += '\n' + line;
// }

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

// TODO: parse inlines, fix nested blockquotes bug, backslash escapes, proper tab to spaces conversion
// escape dangerous html
function parseLine(line: string, lastOpenedNode: HtmlNode) {
	if (line.search(/\S/) === -1) {
		return closeNode(lastOpenedNode);
	}

	if (lastOpenedNode.nodeName === "html block") {
		lastOpenedNode.textContent += '\n' + line;
		return lastOpenedNode;
	}

	let [nodeName, markerPos] = getBlockNodes(line);
	if (lastOpenedNode.nodeName === "li" && nodeName !== "plain text") {
		lastOpenedNode = getValidOpenedAncestor(lastOpenedNode, markerPos);
	}else if (lastOpenedNode.nodeName === "blockquote" && nodeName !== "plain text" && nodeName !== "blockquote") {
		lastOpenedNode.closed = true;
		lastOpenedNode = getValidOpenedAncestor(lastOpenedNode, markerPos);
	}else if (nodeName === "plain text") {
		const lineContinuedParagraph = continueOpenedParagraph(lastOpenedNode, line);
		if (lineContinuedParagraph) {
			return lastOpenedNode
		}
	}
	let nodeNewName = checkIfPartOfOtherNodeTypes(lastOpenedNode, markerPos);
	nodeName = nodeNewName ? nodeNewName : nodeName;

	if (nodeName === "hr") {
		lastOpenedNode.children.push({parentNode: lastOpenedNode, nodeName, children: []})
	}else if (nodeName === "header") {
		lastOpenedNode.children.push(getHeaderNodeObj(line, lastOpenedNode))
	}else if (nodeName === "plain text") {
		lastOpenedNode.children.push({parentNode: lastOpenedNode, nodeName: "paragraph", closed: false, textContent: line, children: []})
	}else if (nodeName === "blockquote") {
		if (lastOpenedNode.nodeName !== "blockquote") {
			lastOpenedNode.children.push(
				{parentNode: lastOpenedNode, nodeName: "blockquote", closed: false, indentLevel: lastOpenedNode.indentLevel, children: []} // Is this indent level proper?
			)
			lastOpenedNode = lastOpenedNode.children[lastOpenedNode.children.length - 1];
		}else if (lastOpenedNode.nodeName === "blockquote" && (markerPos - (lastOpenedNode.indentLevel as number) < 0)) {
			lastOpenedNode.closed = true;
			lastOpenedNode = getValidOpenedAncestor(lastOpenedNode, markerPos);
			lastOpenedNode.children.push(
				{parentNode: lastOpenedNode, nodeName: "blockquote", closed: false, indentLevel: lastOpenedNode.indentLevel, children: []} // Is this indent level proper?
			)
			lastOpenedNode = lastOpenedNode.children[lastOpenedNode.children.length - 1];
		}
		
		let actualIndentLevel = lastOpenedNode.indentLevel
		lastOpenedNode.nodeName = "main"; // makes every nested node actually believe it's root
		lastOpenedNode.indentLevel = 0; // makes every nested node actually believe it's root

		let lastOpenedBlockChild = getInnerMostOpenContainer(lastOpenedNode);
		lastOpenedBlockChild = lastOpenedBlockChild ? lastOpenedBlockChild : lastOpenedNode
		parseLine(line.slice(markerPos+1), lastOpenedBlockChild);

		lastOpenedNode.nodeName = "blockquote"; // restore to actual value
		lastOpenedNode.indentLevel = actualIndentLevel; // restore to actual value
	}else if (nodeName === "ol-li" || nodeName === "ul-li") {
		lastOpenedNode = addListItem(nodeName, lastOpenedNode, line, markerPos)
	}else if (nodeName === "fenced code") {
		addFencedCodeContent(lastOpenedNode, line);
	}else if (nodeName === "indented code block") {
		addIndentedCodeBlockContent(lastOpenedNode, line)
	}else if (nodeName === "html block") {
		lastOpenedNode.children.push(
			{parentNode: lastOpenedNode, nodeName: "html block", closed: false, textContent: line, children: []}
		)
		lastOpenedNode = lastOpenedNode.children[lastOpenedNode.children.length-1]
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