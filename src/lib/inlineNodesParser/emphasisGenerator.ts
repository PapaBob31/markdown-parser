import type { Node } from "./index"
import { PUNCTUATIONS } from "./index"

export function setAsLeftOrRightFlanking(currentNode: Node, textStream: string, charIndex: number) {
	const currentChar = textStream[charIndex];
	const prevChar = currentNode.prev ? currentNode.prev.content[currentNode.prev.content.length-1] : ' ';
	const nextChar = charIndex < textStream.length-1 ? textStream[charIndex+1] : null;

	const nextCharIsPunc = PUNCTUATIONS.includes(nextChar);
	const prevCharIsPunc = PUNCTUATIONS.includes(prevChar);

	if (!nextChar || nextChar !== currentChar) {
		if (!(/\s/).test(nextChar) && !nextCharIsPunc) {
			currentNode.type = "lf delimiter run"; // left flanking delimiter run
		}else if (nextCharIsPunc && (prevCharIsPunc || (/\s/).test(prevChar))) {
			currentNode.type = "lf delimiter run";
		}

		if (!(/\s/).test(prevChar) && !prevCharIsPunc) {

			if (currentNode.type === "lf delimiter run")
				currentNode.type = "bf delimiter run" // both left and right flanking delimiter run
			else currentNode.type = "rf delimiter run";

		}else if (prevCharIsPunc && (nextCharIsPunc || (/\s/).test(nextChar))) {

			if (currentNode.type === "lf delimiter run")
				currentNode.type = "bf delimiter run"
			else currentNode.type = "rf delimiter run"; // right flanking delimiter run

		}

		if (currentNode.type === "pot delimiter run") {
			currentNode.type = "text content"
		}
	}
}
/** BASIC RULES
 * single * can open emphasis only if it's lf
 * single _ can open emphasis if it's lf and preceeded by whitespace or punctuation
 * single * can close emphasis only if it's rf
 * single _ can close emphasis if it's rf and followed by whitespace or punctuation
 * same rules apply to the double versions

 * PARSING STRATEGY
 * Iterate through the linked list looking for delimiter runs
 * that can close shi (using the conditions under BASIC RULES)
 * If any is found, traverse back up to find any opener
 * close any opener that's not the same type with the closer i.e different char delimiters
 * `a delimiter that can both open and close cannot form emphasis if the sum of the lengths of
 * the delimiter runs containing the opening and closing delimiters is a multiple of 3 unless 
 * both lengths are multiples of 3.` so skip it when you can
 */

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



function getNearestEmphasisOpener(node: Node){
	let currentNode = node.prev;
	let uselessNodes = [];
	while (true) {
		if (!currentNode) 
			return null;
		if ((node.content[0] !== currentNode.content[0])){
			currentNode = currentNode.prev;
			continue;
		}
		if (canOpenEmphasis(currentNode) && !specialBfCase(currentNode, currentNode)) {
			uselessNodes.forEach(node => {node.type = "text content"});
			return currentNode
		}else {
			uselessNodes.push(currentNode);
		}
		currentNode = currentNode.prev;
	}
}


function specialBfCase(node1: Node, node2: Node) {
	if (node1.type === "bf delimiter run" || node2.type === "bf delimiter run") {
		if ((node1.content.length + node2.content.length)%3 !== 0) {
			return false
		}else if (node1.content.length%3 === 0 && node2.content.length%3 === 0){
			return true
		}
	}
	return false
}

export default function processEmphasisNodes(head: Node) {
	let currentNode = head;
	let openers = [];
	while (true) {
		if (canCloseEmphasis(currentNode)) {
			const opener = getNearestEmphasisOpener(currentNode);
			if (!opener) {
				currentNode.closed = true; // should it be closing or changing of type?
			}else {
				transformNodes(opener, currentNode)
			}
		}
		if (!currentNode.next) break;
		currentNode = currentNode.next;
	}
}

function canOpenEmphasis(node: Node) {
	if (node.type === "bf delimiter run") {
		return true;
	}else if (node.type === "lf delimiter run") {
		let prevChar = node.prev ? node.prev.content[0] : "";

		if (node.content === '*') {
			return true;
		}else if (!prevChar || PUNCTUATIONS.includes(prevChar) || (/\s/).test(prevChar)) {
			return true;
		}
	}
	return false;
}


function canCloseEmphasis(node: Node) {
	if (node.type === "bf delimiter run") {
		return true;
	}else if (node.type === "rf delimiter run") {
		let nextChar = node.next ? node.next.content[0] : "";

		if (node.content === '*') {
			return true;
		}else if (!nextChar || PUNCTUATIONS.includes(nextChar) || (/\s/).test(nextChar)) {
			return true;
		}
	}
	return false;
}