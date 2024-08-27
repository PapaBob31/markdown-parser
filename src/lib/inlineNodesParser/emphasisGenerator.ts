import type { Node } from "./index"
import { PUNCTUATIONS } from "./index"

export function setAsLeftOrRightFlanking(delimiterNode: Node, nextChar: string) {
	let nextCharIsPunc = PUNCTUATIONS.includes(nextChar);
	// since new lines should be treated as whitespace
	let prevChar = delimiterNode.prev ? delimiterNode.prev.content[delimiterNode.prev.content.length-1] : ' ';
	let prevCharIsPunc = PUNCTUATIONS.includes(prevChar);

	if (!(/\s/).test(nextChar) && !nextCharIsPunc) {
		delimiterNode.type = "left flanking " + delimiterNode.type;
	}else if (nextCharIsPunc && (prevCharIsPunc || (/\s/).test(prevChar))) {
		delimiterNode.type = "left flanking " + delimiterNode.type;
	}else if (!(/\s/).test(prevChar) && !prevCharIsPunc) {
		delimiterNode.type = "right flanking " + delimiterNode.type;
	}else if (prevCharIsPunc && (nextCharIsPunc || (/\s/).test(nextChar))) {
		delimiterNode.type = "right flanking " + delimiterNode.type;
	}
}

// transform node content into raw em|strong tag html
function transformNodes(opener: Node, closer: Node): Node{
	let newNodeName = ""
	if (closer.content.length >= 2 && opener.content.length >= 2) {
		if (closer.content.length % 2 === 0) {
			newNodeName = "strong";
		}else {
			newNodeName = "em"
		}
	}else if (opener.content.length === 1 || closer.content.length === 1) {
		newNodeName = "em";
	}

	if (opener.content.length <= 2) {
		opener.content = opener.content.length === 1 ? "<em>" : "<strong>"
		opener.type = "raw html";
	}else {
		let newNode:Node = {type: "raw html", closed: true, content: `<${newNodeName}>`, next: opener.next, prev: opener};
		opener.next = newNode;
	}

	if (closer.content.length <= 2) {
		closer.content = closer.content.length === 1 ? "</em>" : "</strong>"
		opener.type = "raw html";
	}else {
		let newNode = {type: "raw html", closed: true, content: `</${newNodeName}>`, next: closer, prev: closer.prev};
		closer.prev = newNode;
	}

	if (opener.type === "raw html" || closer.type === "raw html") {
		return;
	}

	if (newNodeName === "em") {
		opener.content = opener.content.slice(0, opener.content.length-1)
		closer.content = closer.content.slice(1);
		transformNodes(opener, closer);
	}else {
		opener.content = opener.content.slice(0, opener.content.length-2)
		closer.content = closer.content.slice(2);
		transformNodes(opener, closer);
	}
}

function uselessAllMarkersBetween(startNode: Node, targetNode: Node) {
	let currentNode = startNode.next;
	while (true) {
		if (!currentNode || currentNode === targetNode) {
			break;
		}else if (currentNode.type === startNode.type) {
			currentNode.type = "text content";
		}
		currentNode = currentNode.next;
	}
}

function findClosingNode(openingNode: Node) {
	let currentNode = openingNode.next;
	while (true) {
		if (!currentNode) break;
		if ((currentNode.content[0] === openingNode.content[0]) && 
			currentNode.type.startsWith("right flanking")) {
			uselessAllMarkersBetween(openingNode, currentNode as Node);
			return currentNode;
		}
		currentNode = currentNode.next;
	}
	return null
}


export default function processEmphasisNodes(head: Node) { // TODO: process nodes that are both right and left flanking as well as '_' marker special cases
	let currentNode = head;
	let openers = [];
	while (true) {
		if (currentNode.type.startsWith("left flanking")) {
			openers.push(currentNode);
		}
		currentNode = currentNode.next as Node;
		if (!currentNode) break;
	}
	for (let i=openers.length-1; i>=0; i--) {
		let closingNode = findClosingNode(openers[i]);
		if (closingNode) {
			transformNodes(openers[i], closingNode)
		}
	}
}