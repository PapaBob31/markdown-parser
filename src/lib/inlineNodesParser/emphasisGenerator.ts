import type { Node } from "./index"
import { PUNCTUATIONS } from "./index"

/*
left flanking delimiter run
****[non whitespace|punctuation]
[punctuation|whitespace]****[punctuation]

right flanking delimiter run
[non whitespace|punctuation]****
[punctuation]****[punctuation|whitespace]
*/

/** Set the type attribute of a node whose content is a potential delimiter run to right flanking or 
 * left flanking according to the common mark spec
 * @param {Node} currentNode - the node whose content attribute contains the potential delimiter run substring
 * @param {string} textStream - is the string the delimiter run substring was extracted from
 * @param {number} charIndex - is textStream's index of the last character in the delimiter run substring */
export function setAsLeftOrRightFlanking(currentNode: Node, textStream: string, charIndex: number) {
	const currentChar = textStream[charIndex]; // last character in the potential delimiter run

	// character before the character that started the potential delimiter run
	const prevChar = currentNode.prev ? currentNode.prev.content[currentNode.prev.content.length-1] : ' '; 
	const nextChar = charIndex < textStream.length-1 ? textStream[charIndex+1] : ' '; // character after the last character in the potential delimiter run

	// Todo: Implement this: Unicode symbols count as punctuation, too
	const nextCharIsPunc = PUNCTUATIONS.includes(nextChar) || "$£€".includes(nextChar); // 
	const prevCharIsPunc = PUNCTUATIONS.includes(prevChar) || "$£€".includes(prevChar);

	if (nextChar !== currentChar) { // We have a complete delimiter run

		// left flanking delimiter run check
		if (!(/\s/).test(nextChar) && !nextCharIsPunc) {
			currentNode.type = "lf delimiter run"; // left flanking delimiter run
		}else if (nextCharIsPunc && (prevCharIsPunc || (/\s/).test(prevChar))) {
			currentNode.type = "lf delimiter run";
		}

		// right flanking delimiter run check
		if (!(/\s/).test(prevChar) && !prevCharIsPunc) {

			if (currentNode.type === "lf delimiter run")
				currentNode.type = "bf delimiter run" // both left and right flanking delimiter run
			else currentNode.type = "rf delimiter run";

		}else if (prevCharIsPunc && (nextCharIsPunc || (/\s/).test(nextChar))) {

			if (currentNode.type === "lf delimiter run")
				currentNode.type = "bf delimiter run"
			else currentNode.type = "rf delimiter run"; // right flanking delimiter run

		}

		if (currentNode.type === "pot delimiter run") { // complete delimiter run that's neither left nor right flanking
			currentNode.type = "text content"
		}
	}
}

/** Creates a new raw html node containing a single 'strong' or 'em' tag string from the content of node and adds it to the node's
 * linked list. It's also possible that the node's content will be directly transformed.
 * @param {Node} node - The node whose content raw emphasis html is to be generated from. It's content is expected to be a delimiter run
 * @param {string} newContent - The new tag ('strong' or 'em') string to be generated */
function generateRawEmphasisHtml(node: Node, newContent: "</em>"|"<em>"|"<strong>"|"</strong>") {
	let markersReplaced = 0;
	if (newContent === "<em>" || newContent === "</em>") {
		markersReplaced = 1;
	}else if (newContent === "<strong>" || newContent === "</strong>") {
		markersReplaced = 2;
	}

	if (node.content.length === 1 || (node.content.length === 2 && (["<strong>", "</strong>"]).includes(newContent))) { // no need to extract a new node
		// transform the existing node to the new node directly
		node.content = newContent;
		node.type = "raw html";
		return
	}

	if (newContent === "</em>" || newContent == "</strong>") {
		// create a new node from an existing one and add it to the linked list so that whatever emphasis indicator remains mi
		node.content = node.content.slice(markersReplaced);
		let newNode = {type: "raw html", closed: true, content: newContent, next: node, prev: node.prev};
		node.prev.next = newNode; 
		node.prev = newNode
	}else if (newContent === "<em>" || newContent == "<strong>") {
		// create a new node from an existing one and add it to the linked list so that whatever emphasis indicator remains mi
		node.content = node.content.slice(0, node.content.length-markersReplaced);
		let newNode = {type: "raw html", closed: true, content: newContent, next: node.next, prev: node};
		node.next.prev = newNode; 
		node.next = newNode
	}
}


/** Recursively determines and transforms the content of two nodes containing the opening and closing delimiter runs of an emphasis respectively.
 * This content is transformed to the appropriate raw html content
 * @param {Node} opener - The opening node whose content is to be transformed. It's content is expected to be a delimiter run
 * @param {Node} closer - The closing node whose content is to be transformed. It's content is expected to be a delimiter run */
function transformNodes(opener: Node, closer: Node){
	if (closer.content.length === 1 || opener.content.length === 1) {
		generateRawEmphasisHtml(opener, "<em>");
		generateRawEmphasisHtml(closer, "</em>");
	}else if (closer.content.length === 2 || opener.content.length === 2) {
		generateRawEmphasisHtml(opener, "<strong>");
		generateRawEmphasisHtml(closer, "</strong>");
	}else {
		generateRawEmphasisHtml(opener, "<strong>");
		generateRawEmphasisHtml(closer, "</strong>");
		transformNodes(opener, closer); // The opener and closer nodes may still have transformable content
	}
}


/** Get the first node whose content can open an emphasis when iterating towards the head of a linked list 
 * starting from a node whose content can close the same type of emphasis
 * @param {Node} node - The node whose content can close parameter 
 * @returns {Node|null} - A node whose content can open emphasis or null if no suitable node was found */
function getNearestEmphasisOpener(node: Node){
	let currentNode = node.prev;
	let uselessNodes = [];
	const specialTypes = ["lf delimiter run", "rf delimiter run", "bf delimiter run"];
	const unMatchedClosingTags:string[] = []
	while (true) {
		if (!currentNode){ // all the nodes that need to be checked have been checked
			return null;
		}

		if (currentNode.type === "raw html" || currentNode.type === "md link html") {
			if ((/^<[^\s>]+\s*\/>$/).test(currentNode.content)) {
				currentNode = currentNode.prev;
				continue
			}
			let closingTagPattern = currentNode.content.match(/^<\/([^\s>]+)\s?>$/)
			if (closingTagPattern){
				unMatchedClosingTags.push(closingTagPattern[1].toLowerCase())
				currentNode = currentNode.prev;
				continue;
			}
			let openingTagPattern = currentNode.content.match(/^<([^\s>]+)\s?.*>$/)
			if (openingTagPattern){
				if (unMatchedClosingTags.pop() !== openingTagPattern[1].toLowerCase()) { // emphasis couldn't close before the start of a non-void html tag
					return null
				}
				currentNode = currentNode.prev;
				continue;
			}
		}else if (!specialTypes.includes(currentNode.type)) { // can't possibly open an emphasis
			currentNode = currentNode.prev;
			continue; // is this even neccessary
		}else if (specialBfCase(node, currentNode) || !canOpenEmphasis(currentNode) || node.content[0] !== currentNode.content[0]) {
			uselessNodes.push(currentNode); // they are left or right flanking but can't open an emphasis in this context
		}else if (unMatchedClosingTags.length === 0) {
			// prevents improper delimiter runs in-between two valid emphasis delimiter runs from being parsed as emphasis later
			uselessNodes.forEach(node => {node.type = "text content"});
			return currentNode;
		}
		currentNode = currentNode.prev;
	}
}

/** First checks if any node's content in a closer and opener pair can both open and close strong emphasis. If true, Determines if
 * the sum of both nodes content length is a multiple of 3 and either nodes' content lengths aren't multiples of 3
 * @param {Node} node1 - Any node of the opener and closer pair
 * @param {Node} node2 - Any node of the opener and closer pair
 * @returns {boolean} - indicating that the above condition is true or false */
function specialBfCase(node1: Node, node2: Node) {
	if (node1.type === "bf delimiter run" || node2.type === "bf delimiter run") {
		return ((node1.content.length + node2.content.length)%3 === 0 && (node1.content.length%3 !== 0 || node2.content.length%3 !== 0))
	}
	return false
}

/** Returns a boolean indicating if a linked list node's content can open emphasis
 * @param {Node} node - The node whose content is to be checked */
function canOpenEmphasis(node: Node) {
	if (node.type === "lf delimiter run") {
		return true;
	}else if (node.type === "bf delimiter run") {
		let prevChar = node.prev ? node.prev.content[node.prev.content.length-1] : "";

		if (node.content[0] === '*') {
			return true;
		}else if (!prevChar || PUNCTUATIONS.includes(prevChar) || (/\s/).test(prevChar)) {
		// Delimiter runs consisting of multiple '_' character that are part of a both (right) flanking delimiter run 
		// can only open emphasis if preceeded by a punctuation character or whitespace
			return true;
		}
	} 
	return false;
}

/** Returns a boolean indicating if a linked list node's content can close emphasis
 * @param {Node} node - The node whose content is to be checked */
function canCloseEmphasis(node: Node) {
	if (node.type === "rf delimiter run") {
		return true;
	}else if (node.type === "bf delimiter run") {
		let nextChar = node.next ? node.next.content[0] : "";
		if (node.content[0] === '*') {
			return true;
		}else if (!nextChar || PUNCTUATIONS.includes(nextChar) || (/\s/).test(nextChar)) {
		// Delimiter runs consisting of multiple '_' character that are part of a both (left) flanking delimiter run 
		// can only close emphasis if followed by a punctuation character or whitespace
			return true;
		}
	}
	return false; 
}

/** Processes the text content of a linked list node for valid emphasis or strong emphasis indicators. If any valid indicator
 * is found, New nodes containing the generated emphasis html is then added to the linked list
 * @param {Node} {head} - The head/start node of the linked list */
export default function processEmphasisNodes(head: Node) {
	let currentNode = head;
	let openers = [];
	while (true) {
		if (canCloseEmphasis(currentNode)) { 
			const opener = getNearestEmphasisOpener(currentNode);
			if (opener) { // a node with a valid emphasis opening delimiter run as it's content
				transformNodes(opener, currentNode)
			}
			if (!opener || currentNode.type === "raw html" || currentNode.type === "text content") {
				if (!currentNode.next) break; // end of linked list
				currentNode = currentNode.next;
			}
		}else {
			if (!currentNode.next) break; // end of linked list
			currentNode = currentNode.next;
		}
	}
}