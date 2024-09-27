import type { Node } from "./index"
import type { LinkRef } from "../htmlGenerator"
import { escapeSpecialCharacters } from "../htmlGenerator"
import { getEscapedForm } from "./index"


function getEnclosedText(startNode: Node, endNode: Node) {
	let currentNode = startNode.next;
	let outputText = "";

	while (currentNode !== endNode) {
		outputText += currentNode.content;
		currentNode = currentNode.next;
	}
	return outputText;
}

function normalized(str: string) {
	return str.toLowerCase().replace(/\s+/, ' ').trim();
}


interface LinkAttributes {
	uri: string;
	title: string;
	endPos: number;
	attrEndNode: Node;
}

function getReferenceLinkData(labelStr: string, linkRefs: LinkRef[]): LinkAttributes {
	for (let obj of linkRefs) {
		if (normalized(obj.label) === normalized(labelStr)) {
			return {uri: obj.destination, title: obj.title, endPos: -1, attrEndNode: null};
		}
	}
	return null;
}


function getReferenceLinks(linkText: string, labelStartNode: Node|null, linkRefs: LinkRef[]) {
	if (!labelStartNode || labelStartNode.type !== "link marker start") {
		return getReferenceLinkData(linkText, linkRefs);
	}
	let currentNode = labelStartNode.next;
	let labelText = ""

	while (true) {
		if (!currentNode) {
			return getReferenceLinkData(linkText, linkRefs);
		}else if (currentNode.type === "link marker end") {
			if (!labelText) // possibly a collapsed ref link
				labelText = linkText;
			let data = getReferenceLinkData(labelText, linkRefs);
			if (data){
				data.attrEndNode = currentNode;
			}else data = getReferenceLinkData(linkText, linkRefs);
			return data;
		}
		labelText += currentNode.content;
		currentNode = currentNode.next;
	}
}

function changeToHtml(opener: Node, closer: Node, linkType: string, linkAttributes: LinkAttributes, linkText: string):Node {
	let nextNode: Node = null;

	if (linkAttributes.endPos > -1) {
		let startIndex = linkAttributes.endPos+1;
		linkAttributes.attrEndNode.content = linkAttributes.attrEndNode.content.slice(startIndex); // might be an empty string but doesn't really matter
	}
	if (!linkAttributes.attrEndNode) { // shortcut refernece link
		nextNode = closer.next;
	}else if (linkAttributes.attrEndNode.type === "link marker end") { // full reference link
		nextNode = linkAttributes.attrEndNode.next;
	}else { // normal links
		nextNode = linkAttributes.attrEndNode
	}

	if (linkType === "link") {
		opener.content = `<a href="${linkAttributes.uri}" title="${linkAttributes.title}">`;
		closer.content = `</a>`
		closer.next = nextNode
		if (nextNode)
			nextNode.prev = closer;
	}else {
		opener.content = `<img src="${linkAttributes.uri}" alt="${linkText}" title="${linkAttributes.title}">`;
		opener.next = nextNode
		if (nextNode)
			nextNode.prev = opener;
	}
	opener.type = "raw html"
	closer.type = "raw html"
	return nextNode
}

function transformToLinkHtml(openingNode: Node, closingNode: Node, linkRefs: LinkRef[]): Node {
	let linkAttributes:LinkAttributes;
	let linkText = getEnclosedText(openingNode, closingNode)
	let linkType = openingNode.content === "![" ? "img" : "link"
	if (linkType === "link" && !linkText) {
		return null;
	}

	linkAttributes = getLinkAttributes(closingNode.next);
	if (!linkAttributes) {
		linkAttributes = getReferenceLinks(linkText, closingNode.next, linkRefs);
	}

	if (!linkAttributes) {
		return null;
	}else {
		return changeToHtml(openingNode, closingNode, linkType, linkAttributes, linkText);
	}
}

export default function generateLinkHtmlNodes(head: Node, linkRefs: LinkRef[]) {
	let currentNode = head;
	let openers = [];

	while (currentNode !== null) { // maybe implement breaking when it encounters tag that can't be nested inside link tags
		if (currentNode.type === "link marker start") {
			openers.push(currentNode);
		}else if (currentNode.type === "link marker end") {
			let nextNode = null;
			let openingNode: Node;
			if (openers.length > 0) {
				openingNode = openers[openers.length-1]
				nextNode = transformToLinkHtml(openingNode, currentNode, linkRefs);
			}
			if (nextNode) {
				openers.pop()
				currentNode = nextNode;
				let openerBefore = openers[openers.length-1]
				if (!openerBefore || openingNode.content !== '![' || openerBefore.content !== '[') {
					openers.forEach(node => {node.type = "text content"});
					openers = [];
				}
				continue;				
			}else {
				currentNode.type = "text content"
			}
		}
		currentNode = currentNode.next;
	}
}

function getOpener(node: Node) {
	let currentNode = node;
	while (true) {
		if (!currentNode || currentNode.type === "inline link html") {
			return null
		}else if (currentNode.type === "link start marker") {
			return currentNode;
		}
		currentNode = currentNode.prev
	}
}


function getLinkAttributes(startNode: Node): LinkAttributes {
	if (!startNode || startNode.content[0] !== '(') {
		return null;
	}
	let i = 1; // ignore the starting '('
	let attrs:LinkAttributes = {uri: "", title: "", endPos: 0, attrEndNode: null};
	let linkComponent = "";
	let openedBracketsNum = 0;
	let textStream = startNode.content;
	let currentNode = startNode;

	while (true) {
		if (i == textStream.length && !currentNode.next) {
			return null;
		}else if (i == textStream.length) {
			currentNode = currentNode.next
			textStream = currentNode.content
			i = 0;
		}

		let char = textStream[i];
		if (linkComponent === "uri" && attrs.uri[0] === '<' && !['\n', '<'].includes(char)) {
			attrs.uri += char;
			if (char === '>') {
				linkComponent = "";
			}
		}else if (linkComponent === "uri") {
			return null;
		}
		
		let charIsWhiteSpace = (/\s/).test(char);
		if (char === ')' && openedBracketsNum === 0 && linkComponent !== "title") {
 			attrs.endPos = i;
 			attrs.attrEndNode = currentNode;
 			attrs.title = escapeSpecialCharacters(attrs.title)
 			attrs.uri = escapeSpecialCharacters(attrs.uri)
 			return attrs
 		}

		if (linkComponent === "url") {
			if (charIsWhiteSpace && openedBracketsNum !== 0)  {
				return null;
			}else if (charIsWhiteSpace) {
				linkComponent = "";
			}else {
				attrs.uri += char;
			}
		}else if (linkComponent === "title") {
			if (attrs.title[0] === char || (attrs.title[0] === '(' && char === ')')) {
				linkComponent = "";
				attrs.title = attrs.title.slice(1);
			}else {
				attrs.title += char;
			}
		}else if (!attrs.uri && !charIsWhiteSpace) {
			linkComponent = "url"
			attrs.uri += char;
		}else if (!attrs.title && ["(", '"', "'"].includes(char)){
			linkComponent = "title"
			attrs.title += char;
		}else if (char === '(' && linkComponent === "url" && attrs.uri[0] !== '<') {
			openedBracketsNum++;
		}else if (char === ')' && linkComponent === "url" && attrs.uri[0] !== '<') {
			openedBracketsNum--;
		}else if (attrs.uri && !charIsWhiteSpace){ // invalid text after uri
			return null
		}
		i++;
	}
}
