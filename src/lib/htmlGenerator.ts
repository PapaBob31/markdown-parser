import type { HtmlNode } from "../index"
import parseInlineNodes, { PUNCTUATIONS, getEscapedForm } from "./inlineNodesParser"
import { getLinkReferenceDefs } from "./inlineNodesParser/linkGenerator"
import type {LinkRef} from "./inlineNodesParser/linkGenerator"

export function escapeSpecialCharacters(text: string) {
	let i=0;
	let escapedText = ""

	while (i < text.length){
		if (PUNCTUATIONS.includes(text[i])) {
			escapedText += getEscapedForm(text[i]);
		}else {
			escapedText += text[i];
		}
		i++;
	}

	return escapedText
}


export function traverseTreeToGetLinkRefs(rootNode: HtmlNode) {
	let refs: LinkRef[] = [];

	if (rootNode.children && rootNode.children.length > 0) {
		for (let i=0; i<rootNode.children.length; i++) {
			let childNode = rootNode.children[i];
			if (["blockquote", "ul", "ol", "li"].includes(childNode.nodeName)){
				refs = refs.concat(traverseTreeToGetLinkRefs(childNode));
				continue
			}
			if (childNode.nodeName !== "paragraph") {
				continue;
			}
			let linkReference = getLinkReferenceDefs(childNode.textContent as string);
			if (linkReference) {
				refs.push(linkReference);
				rootNode.children[i].textContent = ""; // since it contains link reference definitions
			}
		}
	}
	return refs;
}

/*
	'|' must delimit cells because the user might just be trying to pad the table and the whitespace will be taken as content
	my implementation, my rules
	|| i.e pipes without any content in between isn't allowed, put something even if it's just whitespace
	beginning and ending whitespace would be stripped if present
	content in delimiter row cells can only be '-'
*/
// Serializes a line that contains *my markdown* table rows and return an array of the content
function getRowContents(line: string){
	let cellData = "";
	let cells = [];
	let i = 0;
	let charIsEscaped = false

	while (i < line.length) {
		if (line[i] === '\\') {
			charIsEscaped = true;
		}else if (line[i] === '|' && !charIsEscaped) {
			if (cellData) {
				cellData === ' ab' && console.log(cellData)
				cells.push(cellData);
				cellData = "";
			}else if (cells.length > 0) { // pipes without any content in between isn't allowed i.e '||'
				cells = [];
				break;
			}	
		}else {
			if (charIsEscaped && line[i] !== '|') {
				cellData += '\\' // only '|' can be escaped in tables
			}
			charIsEscaped = false // Resets to default whether '|' was escaped or not
			cellData += line[i]
		}

		if (i == line.length-1 && line[i] !== '|') { // row doesn't have a trailing '|' making it invalid
			cells = [];
		}
		i++;
	}
	return cells
}

function getCellAlignment(cell: string) {
	let alignment = null
	if (cell[0] === ":")
		alignment = "left";

	if (cell[cell.length-1] === ":" && alignment === "left")
		alignment = "center"
	else if (cell[cell.length-1] === ":" && alignment !== "left")
		alignment = "right";

	return alignment
}

interface TableData {
	headerCells: string[];
	bodyCells: string[][];
	cellsAlignment: string[];
}

function stripSpace(text: string) {
	if (text[0] === text[text.length-1] && text[0] === ' ') {
		return text.slice(1, text.length-1)
	}
	return text
}


// Returns generated html table from the TableData object passed as a parameter
function generateTableHtml(tableData: TableData, indentLevel: number){
	let text = `${' '.repeat(indentLevel)}<table>\n`
	text += `${' '.repeat(indentLevel+2)}<thead>\n`
	text += `${' '.repeat(indentLevel+4)}<tr>\n`;

	for (let i=0; i < tableData.headerCells.length; i++) {
		const alignment = tableData.cellsAlignment[i]
		const cell = tableData.headerCells[i];
		text += `${' '.repeat(indentLevel+6)}<th${alignment ? ' align='+alignment: ""}>${stripSpace(cell)}</th>\n`
	}
	text += `${' '.repeat(indentLevel+4)}</tr>\n`;
	text += `${' '.repeat(indentLevel+2)}</thead>\n`

	text += `${' '.repeat(indentLevel+2)}<tbody>\n`
	for (let row of tableData.bodyCells) {
		text += `${' '.repeat(indentLevel+4)}<tr>\n`
		for (let i=0; i<row.length; i++) {
			const alignment = tableData.cellsAlignment[i]
			text += `${' '.repeat(indentLevel+6)}<td${alignment ? ' align='+alignment: ""}>${stripSpace(row[i])}</td>\n`
		}
		if (row.length < tableData.headerCells.length) {
			text += (`${' '.repeat(indentLevel+6)}<td></td>\n`).repeat(tableData.headerCells.length - row.length)
		}
		text += `${' '.repeat(indentLevel+4)}</tr>\n`
	}
	text += `${' '.repeat(indentLevel+2)}</tbody>\n`

	text += `${' '.repeat(indentLevel)}</table>\n`
	return text
}

/** Returns the html table representation of a string conforming to *my markdown* table spec
 * @param {text} : text that the html table would be generated from
 * @param {indentLevel} : number indicating how many spaces the table should indented when generated */
function constructTableFrom(text: string, indentLevel: number) {
	const tableData:TableData = {headerCells: [], bodyCells: [], cellsAlignment: []}
	let tableRows = text.split(/(?:\r\n)|\n|\r/);

	function cellsAreDelimiters(cells: string[]) {
		return cells.every(cell => (/^\s*:?-+:?\s*$/).test(cell))
	}

	if (tableRows[0] == text)
		return "";
	for (let i=0; i<tableRows.length; i++) {
		const cells = getRowContents(tableRows[i])
		if (cells.length === 0) {
			return "";
		}
		if (tableData.headerCells.length === 0) {
			if (cells.length === 0)
				return "";
			tableData.headerCells = [...cells]
		}else if (tableData.cellsAlignment.length === 0) { // No delimiter row yet. Getting a delimiter row equals getting a cellsAllignment row
			if (cells.length === 0 || cells.length !== tableData.headerCells.length || !cellsAreDelimiters(cells)) // Row isn't a `delimiter row`
				return "";
			tableData.cellsAlignment = cells.map((cell) => getCellAlignment(cell))
		}else if (cells.length === 0) { // Row doesn't conform to any of the table specification invalidating the whole table
			return "";
		}else {
			tableData.bodyCells.push(cells);
		}
	}
	return generateTableHtml(tableData, indentLevel);
}

export function formsValidCharRef(text: string, index: number) { // we still need to do decimal and hexadecimal references
	let ref = ""
	let validRefs: string[] = ["amp", "copy", "lg", "gt", "lt", "apos", "quot"]; // get the rest from the html spec or maybe not

	for (let i=index+1; i<text.length; i++) {
		if ((/\s/).test(text[i])){
			return false;
		}else if (text[i] === ';') {
			break;
		}else if (i === text.length-1) {
			ref = "";
			break;
		}
		ref += text[i];
	}
	if (validRefs.includes(ref)) {
		return true;
	}
	return false
}

/** Returns a new string that's the same with the textStream parameter
 *  except ampersand character starting invalid HTML character references have been escaped */
function removeInvalidCharRef(textStream: string) {
	let output = ""
	for (let i=0; i<textStream.length; i++){
		if (textStream[i] === '&' && !formsValidCharRef(textStream, i)) {
			output += "&amp;"
			continue;
		}
		output += textStream[i];
	}
	return output
}

// parse the content of leaf blocks for inline nodes and unescaped html tags
function parseContent(node: HtmlNode, linkRefs: LinkRef[], dangerousHtmlTags:string[]) {
	if (node.nodeName === "paragraph" || (/h[1-6]/).test(node.nodeName)) {
		node.textContent = parseInlineNodes(node.textContent as string, linkRefs, dangerousHtmlTags);
		if ((/h[1-6]/).test(node.nodeName))  {
			node.textContent = node.textContent.trimLeft();
		}
	}else if (["indented code block", "fenced code"].includes(node.nodeName)) {
		node.textContent = escapeSpecialCharacters(node.textContent)
	}

	if (!["indented code block", "fenced code"].includes(node.nodeName) && node.textContent) {
		node.textContent = removeInvalidCharRef(node.textContent);
	}
}

// Returnsa a boolean indicating if a node's grandparent is a loose list
// node parameter expected is a leaf block type
function listAncestorIsLoose(node: HtmlNode){
	let listNodeAncestor = node.parentNode.parentNode;
	if (listNodeAncestor && listNodeAncestor.tight === "false") {
		return true;
	}
	return false;
}

/// Generates the html representation of a node
function generateNodeHtml(node: HtmlNode, indentLevel: number) {
	const whiteSpace = ' '.repeat(indentLevel); // indentation for node's generated html

	if (node.nodeName === "html block") {
		return `${whiteSpace}${node.textContent}\n`
	}else if (node.nodeName === "paragraph") {
		let tableHtml = constructTableFrom(node.textContent, indentLevel);
		if (tableHtml) {
			return tableHtml;
		}
		if (node.parentNode.nodeName !== "li" || listAncestorIsLoose(node))
			return node.textContent ? `${whiteSpace}<p>${node.textContent}</p>\n` : "";
		return node.textContent ? `${whiteSpace}${node.textContent}\n` : ""; // Paragraph nodes inside tight lists should be rendered without tags
	}else if ((/h[1-6]/).test(node.nodeName)) {
		const tag = node.nodeName;
		return `${whiteSpace}<${tag}>${node.textContent}</${tag}>\n` // html header
	}else if (node.nodeName === "fenced code" || node.nodeName === "indented code block") {
		return `${whiteSpace}<pre class="${node.infoString || ''}">\n${whiteSpace+'  '}<code>${node.textContent}\n${whiteSpace+'  '}</code>\n${whiteSpace}</pre>\n`
	}
}


/** Generates html text from a tree containing markdown blocks as nodes
 * @param {rootNode} : The root node of the tree 
 * @param {indentLevel} : The number of spaces to be used for indentation when generating content
 * @param {linkRefs} : key-value mappings of link label and link label reference definitions 
 * @param {dangerousHtmlTags} : array of strings containing tag names that would be considered dangerous html */
export default function generateHtmlFromTree(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRef[], dangerousHtmlTags:string[]):string {
	let text = "";
	const whiteSpace = ' '.repeat(indentLevel); // indentation for node's generated html

	// Generate the opening tag for the node
	if (rootNode.nodeName === "hr") {
		return `${whiteSpace}<${rootNode.nodeName}/>\n`
	}else if (rootNode.nodeName === "ol") {
		text = `${whiteSpace}<${rootNode.nodeName} start="${rootNode.startNo}">\n`	
	}else if (rootNode.textContent === undefined) {
		text = `${whiteSpace}<${rootNode.nodeName}>\n`;
	}

	if (rootNode.textContent === undefined) { // rootNode is a container block
		if (rootNode.nodeName === "root") // the root node of the tree
			text = ""; // Html shouldn't be generated for the tree's root node because it represents the document being parsed
		else 
			indentLevel += 2; // A node's children should be indented 2 spaces more than the parent

		for (let childNode of rootNode.children) {
			text += `${generateHtmlFromTree(childNode, indentLevel, linkRefs, dangerousHtmlTags)}`;
		}
	}else { // rootNode is a leaf block
		parseContent(rootNode, linkRefs, dangerousHtmlTags)
		text = generateNodeHtml(rootNode, indentLevel);
	}

	if (rootNode.textContent === undefined && rootNode.nodeName !== "root") {
		text += `${whiteSpace}</${rootNode.nodeName}>\n`; // Generate the closing tag for the node
	}
	
	return text;
}

