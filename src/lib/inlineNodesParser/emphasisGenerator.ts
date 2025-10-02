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

/** Set the type attribute of a node whose content is a potential delimiter run as right flanking or left flanking according to the GFM spec
 * @param {currentNode} the node whose content attribute contains the potential delimiter run substring
 * @param {textStream} is the string the delimiter run substring was extracted from
 * @param {charIndex} is textStream's index of the last character in the delimiter run substring */
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

/** Creates a new node from the content of an existing node inside a linked list.
 * The new node's content would be any of the html emphasis closing or opening tags
 * @param {node}: the node whose content a new node is to be created from. It's content is expected to be a delimiter run
 * @param {newContent}: the content the new node would contain
*/
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
		// create a new node from an existing one and add it to the linked list
		node.content = node.content.slice(markersReplaced);
		let newNode = {type: "raw html", closed: true, content: newContent, next: node, prev: node.prev};
		node.prev.next = newNode; 
		node.prev = newNode
	}else if (newContent === "<em>" || newContent == "<strong>") {
		// create a new node from an existing one and add it to the linked list
		node.content = node.content.slice(0, node.content.length-markersReplaced);
		let newNode = {type: "raw html", closed: true, content: newContent, next: node.next, prev: node};
		node.next.prev = newNode; 
		node.next = newNode
	}
}

// transforms the opener and closer parameter's content into raw em|strong tag html
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


// Get the nearest Node when moving up the linked list containing a delimiter run 
// that can open an emphasis that will be closed by the node parameter
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
			let closingTagPattern = currentNode.content.match(/^<\/([^\s>]+)\s?>$/)
			if (closingTagPattern){
				unMatchedClosingTags.push(closingTagPattern[1].toLowerCase())
				currentNode = currentNode.prev;
				continue;
			}
			let openingTagPattern = currentNode.content.match(/^<([^\s>]+)\s?.*>$/)
			if (openingTagPattern){
				// console.log(unMatchedClosingTags, openingTagPattern[1])
				if (unMatchedClosingTags.pop() !== openingTagPattern[1].toLowerCase()) {
					// console.log("yeet")
					return null
				}
				currentNode = currentNode.prev;
				continue;
			}else {
				let voidTagPattern = currentNode.content.match(/^<[^\s+>]\s*\/>$/)
				if (!voidTagPattern){
					// console.log("there")
					return null
				}
			}
		}else if (!specialTypes.includes(currentNode.type)) { // can't possibly open an emphasis
			currentNode = currentNode.prev;
			continue; // is this even neccessary
		}else if (specialBfCase(node, currentNode) || !canOpenEmphasis(currentNode) || node.content[0] !== currentNode.content[0]) {
			uselessNodes.push(currentNode); // they are left or right flanking but can't open an emphasis in this context
		}else if (unMatchedClosingTags.length === 0) {
			// prevents delimiter runs already embedded inside emphasis from being parsed as emphasis later
			uselessNodes.forEach(node => {node.type = "text content"});
			return currentNode;
		}
		currentNode = currentNode.prev;
	}
}

/** Returns a boolean indicating if `node1` and `node2` whose contents are delimiter runs satisfies the condition below.
 * Either node1 or node2's contents are both right and left flanking delimiter runs and the sum of the lengths of 
 * both node's delimiter runs is a multiple of 3 unless both lengths are multiples of 3. */
function specialBfCase(node1: Node, node2: Node) {
	if (node1.type === "bf delimiter run" || node2.type === "bf delimiter run") {
		if ((node1.content.length + node2.content.length)%3 !== 0) {
			return false
		}else if (node1.content.length%3 === 0 && node2.content.length%3 === 0){
			return false
		}else if ((node1.content.length + node2.content.length)%3 === 0) {
			return true
		}
	}
	return false
}

// Returns a boolean indiacating if the node parameter's content can open emphasis
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

// Returns a boolean indicating if the node parameter's content can close emphasis
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

/** Generates html string|em tags nodes from existing nodes inside a linked list and adds them to the linked list
 * @param {head}: The head/start node of the linked list */
export default function processEmphasisNodes(head: Node) {
	let currentNode = head;
	let openers = [];
	while (true) {
		// console.log(currentNode)
		if (canCloseEmphasis(currentNode)) { 
			const opener = getNearestEmphasisOpener(currentNode);
			if (opener) {
				transformNodes(opener, currentNode)
			}else if (currentNode.type !== "bf delimiter run"){ // currentNode can't later serve as opener for another closing emphasis node
				currentNode.type = "text content";
			}
			// console.log(1, opener.type, opener.content)
			if (!opener || currentNode.type === "raw html" || currentNode.type === "text content") {
				if (!currentNode.next) break; // end of linked list
				currentNode = currentNode.next;
			}
		}else {
			if (!currentNode.next) break; // end of linked list
			currentNode = currentNode.next;
		}
		// console.log(2, currentNode.type, currentNode.content)
		// if (currentNode.type === "raw html" || currentNode.type === "text content") {
		// 	if (!currentNode.next) break; // end of linked list
		// 	currentNode = currentNode.next;
		// }
		
	}
}