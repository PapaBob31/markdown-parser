import type { Node } from "./index"
import type { LinkRef } from "../htmlGenerator"

function getCharTokenType(linkDest: string, linkTitle: string, char: string, currTokenType: string) {
	if (linkDest && linkTitle && currTokenType === "whitespace" && char !== ')') {
		return null;
	}else if (!linkDest && char == '<') {
		return "opened uri";
	}else if (!linkDest) {
		return "uri";
	}else if (currTokenType === "opened uri" && char === '>') {
		return "closed uri";
	}else if (!linkTitle && currTokenType === "whitespace") {
		if (("\"'(").includes(char)) {
			return "title"
		}else return null;
	}else if (currTokenType === "title" && char === linkTitle[0]) {
		return "whitespace";
	}else if (currTokenType === "closed uri") { // uris of form '<content>' should be followed immediately by whitespace
		return null;
	}
	return currTokenType;
}

// get link attributes and remove nodes containing the link attributes
function getLinkAttributes(node: Node) {
	let linkAttributes = {uri: "", title: ""};
	let currentTokenType = ""
	let textStream = node.content;
	if (textStream[0] !== '(') {
		return null;
	}
	let unBalancedParenthesis = 0;
	let nodesWithLinkAttributes = [node]
	let i = 0;

	while (true) {
		let char = textStream[i];
		// detect whitespaces and the first '(' char after the link text marker which is also a marker.
		let charIsWhiteSpace = (/\s/).test(char) || (nodesWithLinkAttributes.length === 1 && i === 0);
		if (charIsWhiteSpace) {
			if (currentTokenType === "closed uri" || (currentTokenType === "uri" && unBalancedParenthesis === 0))  {
				currentTokenType = "whitespace"
			}else if (currentTokenType === "uri") {
				return null
			}
		}else {
			currentTokenType = getCharTokenType(linkAttributes.uri, linkAttributes.title, char, currentTokenType) as string;
			if (!currentTokenType) {
				return null
			}
		}

		if (char === '(' && currentTokenType === "uri") {
			unBalancedParenthesis++;
		}else if (char === ')' && currentTokenType === "uri" && unBalancedParenthesis > 0) {
			unBalancedParenthesis--;
		}else if (char === ')' && (currentTokenType === "whitespace" || currentTokenType === "uri")) {
			break;
		}

		if (currentTokenType === "opened uri" || (currentTokenType === "uri" && !charIsWhiteSpace)) {
			linkAttributes.uri += char;
		}else if (currentTokenType === "title" && (!linkAttributes.title || linkAttributes.title[0] !== char)) {
			linkAttributes.title += char;
		}

		if (i !== textStream.length - 1) {
			i++;
			continue;
		}

		const newNode = nodesWithLinkAttributes[nodesWithLinkAttributes.length-1].next;
		if (newNode && newNode.type !== "raw html") {
			nodesWithLinkAttributes.push(newNode);
			textStream = newNode.content;
			i = 0;
		}else if (newNode && newNode.type === "raw html" && !linkAttributes.uri) { // we might have parsed
			linkAttributes.uri = newNode.content;
			i = newNode.content.length-1;
			currentTokenType = "whitespace"
		}else {
			return null;
		}
	}

	let listLength = nodesWithLinkAttributes.length;
	if (nodesWithLinkAttributes[listLength-1].content.length !== i+1) {
		nodesWithLinkAttributes[listLength-1].content = nodesWithLinkAttributes[listLength-1].content.slice(i+1);
		nodesWithLinkAttributes.pop();
	}

	if (nodesWithLinkAttributes.length > 0) {
		(nodesWithLinkAttributes[0].prev as Node).next = nodesWithLinkAttributes[listLength-1].next as Node;
	}
	linkAttributes.title = linkAttributes.title ? linkAttributes.title.slice(1) : "";
	return linkAttributes;
}

function closeAllLinkMarkersInBetween(startNode: Node, endNode: Node) {
	let currentNode = startNode.next
	while (currentNode !== endNode) {
		(currentNode as Node).closed = true
		currentNode = (currentNode as Node).next;
	}
}

function normalized(str: string) {
	return str.toLowerCase().replace(/\s+/, ' ').trim();
}

function getReferenceLinkData(labelStr: string, linkRefs: LinkRef[]) {
	for (let obj of linkRefs) {
		if (normalized(obj.label) === normalized(labelStr)) {
			return {uri: obj.destination, title: obj.title};
		}
	}
	return null;
}

function getLinkAttributesFromLabel(labelStartNode: Node, linkRefs: LinkRef[]) {
	if (!labelStartNode.next) {
		return null
	}
	if (labelStartNode.next.type === "link marker end"){ // link structure is in form [link text][]
		labelStartNode.prev.next = labelStartNode.next.next; // 'deletes' the nodes containing the []
		return null;
	}else if (labelStartNode.next.type !== "text content") return null;

	const labelEndNode = labelStartNode.next.next
	if (labelEndNode && labelEndNode.type === "link marker end") {
		let refLinkData = getReferenceLinkData(labelStartNode.next.content, linkRefs);
		if (refLinkData) {
			labelStartNode.prev.next = labelEndNode.next; // 'deletes' the nodes containing the link label from the linked list
			return refLinkData
		}
	}
	return null
}

function getEnclosedText(opener: Node, closer: Node) {
	let currentNode = opener.next;
	let outputText = "";

	while (currentNode !== closer) {
		outputText += currentNode.content;
		currentNode = currentNode.next;
	}
	return outputText;
}

function getRefLinks(openerNode: Node, linkRefs: LinkRef[]) {
	let currentNode = openerNode;
	let unBalancedBracketsNum = 0;
	while (true){
		if (currentNode.type === "link marker end") {
			if (unBalancedBracketsNum === 0) {
				return null;
			}
			unBalancedBracketsNum--;
			if (unBalancedBracketsNum === 0 && (!currentNode.next || currentNode.next.type === "link marker start")){
				break;
			}
		}else if (currentNode.type === "link marker start") {
			unBalancedBracketsNum++;
		}
		if (!currentNode.next) {
			break;
		}
		currentNode = currentNode.next;
	}
	let linkTextBoundary = currentNode;
	let linkAttributes;
	if (currentNode.next) {
		linkAttributes = getLinkAttributesFromLabel(currentNode.next,  linkRefs)
	}
	if (!linkAttributes) {
		// check if it's a shortcut or collapsed link reference
		linkAttributes = getReferenceLinkData(getEnclosedText(openerNode, currentNode), linkRefs);
	}
	return linkAttributes ? [linkTextBoundary, linkAttributes] : null
}

export default function generateLinkNodes(head: Node, linkRefs: LinkRef[]) {
	let currentNode = head;
	let openedLinkTextMarkers: Node[] = [];

	while (true) {
		if (currentNode.type === "link marker end" && openedLinkTextMarkers.length === 0) {
			currentNode.type = "text content";
			currentNode.closed = true;
		}else if (currentNode.type === "link marker start" && !currentNode.closed) {
			openedLinkTextMarkers.push(currentNode)
		}else if (currentNode.type === "link marker end") {
			let linkMarkerStart:Node;
			let linkAttributes = currentNode.next && getLinkAttributes(currentNode.next as Node);
			if (linkAttributes) {
				linkMarkerStart = (openedLinkTextMarkers.pop() as Node)
			}else {
				let data = getRefLinks(openedLinkTextMarkers[0], linkRefs);
				if (data) {
					linkMarkerStart = openedLinkTextMarkers[0];
					currentNode = data[0] as Node;
					linkAttributes = data[1] as {uri: string, title: string};
				}
			}
			if (linkAttributes) {
				linkMarkerStart.closed = true;
				closeAllLinkMarkersInBetween(linkMarkerStart, currentNode)
				linkMarkerStart.content = `<a href="${linkAttributes.uri}" title="${linkAttributes.title}">`
				currentNode.content = "</a>";
			}
			openedLinkTextMarkers.forEach(marker => {marker.closed = true});
			openedLinkTextMarkers = [];
			currentNode.closed = true;
		}
		if (!currentNode.next) {
			break;
		}
		currentNode = currentNode.next;
	}
	return head;
}
