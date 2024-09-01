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
 */

function generateRawHtml(node: Node, newContent: string) {
	let markersReplaced = 0;
	if (newContent === "<em>" || newContent === "</em>") {
		markersReplaced = 1;
	}else if (newContent === "<strong>" || newContent === "</strong>") {
		markersReplaced = 2;
	}

	if (node.content.length === 1 || (node.content.length === 2 && (["<strong>", "</strong>"]).includes(newContent))) {
		node.content = newContent;
		node.type = "raw html";
		return
	}

	if (newContent === "</em>" || newContent == "</strong>") {
		node.content = node.content.slice(markersReplaced);
		let newNode = {type: "raw html", closed: true, content: newContent, next: node, prev: node.prev};
		node.prev.next = newNode; 
		node.prev = newNode
	}else if (newContent === "<em>" || newContent == "<strong>") {
		node.content = node.content.slice(0, node.content.length-markersReplaced);
		let newNode = {type: "raw html", closed: true, content: newContent, next: node.next, prev: node};
		node.next.prev = newNode; 
		node.next = newNode
	}
}

// transform node content into raw em|strong tag html
function transformNodes(opener: Node, closer: Node): Node{
	if (closer.content.length === 1 || opener.content.length === 1) {
		generateRawHtml(opener, "<em>");
		generateRawHtml(closer, "</em>");
		return
	}else if (closer.content.length === 2 || opener.content.length === 2) {
		generateRawHtml(opener, "<strong>");
		generateRawHtml(closer, "</strong>");
		return;
	}else {
		generateRawHtml(opener, "<strong>");
		generateRawHtml(closer, "</strong>");
		transformNodes(opener, closer);
	}
}

function getNearestEmphasisOpener(node: Node){
	let currentNode = node.prev;
	let uselessNodes = [];
	while (true) {
		if (!currentNode) 
			return null;
		currentNode.prev.content === "foo-" && console.log(currentNode.content)
		if (node.content[0] === currentNode.content[0] && canOpenEmphasis(currentNode) && !specialBfCase(node, currentNode)) {
			uselessNodes.forEach(node => {node.type = "text content"});
			return currentNode
		}else if (["lf delimiter run", "rf delimiter run", "bf delimiter run"].includes(currentNode.type)) {
			uselessNodes.push(currentNode);
		}
		currentNode = currentNode.prev;
	}
}

/**
 * `a delimiter that can both open and close cannot form emphasis if the sum of the lengths of
 * the delimiter runs containing the opening and closing delimiters is a multiple of 3 unless 
 * both lengths are multiples of 3.` so skip it when you can
*/
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
				currentNode.type = "text content";
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
		let prevChar = node.prev ? node.prev.content[node.prev.content.length-1] : "";

		if (node.content[0] === '*') {
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

		if (node.content[0] === '*') {
			return true;
		}else if (!nextChar || PUNCTUATIONS.includes(nextChar) || (/\s/).test(nextChar)) {
			return true;
		}
	}
	return false;
}