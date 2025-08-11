import type { HtmlNode } from "../index"
import parseInlineNodes, { PUNCTUATIONS, escapeSpecialCharacters } from "./inlineNodesParser"
import { getLinkReferenceDefs } from "./inlineNodesParser/linkGenerator"
import type {LinkRefData, LinkRefDataMap} from "./inlineNodesParser/linkGenerator"

const validEntityRefs = require('./entities.json')


// Traverses a tree to extract all link refernece definitions in the tree
export function traverseTreeToGetLinkRefs(rootNode: HtmlNode) {
	let refs: LinkRefDataMap = {};

	if (!rootNode.children && rootNode.nodeName !== "paragraph") {
		return refs;
	}else if (rootNode.nodeName === "paragraph") {
		let results = getLinkReferenceDefs(rootNode.textContent as string);
		if (results.linkRefsData.length > 0) {
			for (let data of results.linkRefsData) {
				let normalisedLabel = data.label.toLowerCase().replace(/\s+/, ' ').trim()
				if (!refs[normalisedLabel]){ // only the first link reference definition with a specific label should be used
					refs[normalisedLabel] = data;
				}
			}
			rootNode.textContent = results.newText;
		}
		return refs
	}

	for (let childNode of rootNode.children) {
		let newRefs = traverseTreeToGetLinkRefs(childNode);
		for (let [key, value] of Object.entries(newRefs)) {
			if (!refs[key]) {
				refs[key] = newRefs[key];
			}
		}
	}
	return refs;
}


// Serializes a line that contains a GFM table row and return an array of the content/cells
export function getRowContent(line: string){
	let contentRange = false;
	let charIsEscaped = false;
	let cellData = "";
	let cells = [];
	let i = 0;

	while (i < line.length) {
		if (line[i] === '\\') {
			charIsEscaped = true;
		}else if (line[i] === '|' && !charIsEscaped) {
			if (!contentRange) {
				if ((/\S/).test(cellData))
					break;
				else
					contentRange = true;
			}else if (contentRange) {
				cells.push(cellData.trim());
			}
			cellData = "";
		}else {
			if (charIsEscaped && line[i] !== '|') {
				cellData += '\\' // only '|' can be escaped in tables
			}
			charIsEscaped = false // Resets to default whether '|' was escaped or not
			cellData += line[i]
		}

		if (i == line.length-1 && line[i] !== '|' && (/\S/).test(cellData)) { // last cell has no trailing pipe
			cells = []; // invalidate the whole row
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


// Returns generated html table from the TableData object passed as a parameter
function generateTableHtml(tableData: TableData, indentLevel: number, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]){
	let text = `${' '.repeat(indentLevel)}<table>\n`
	text += `${' '.repeat(indentLevel+2)}<thead>\n`
	text += `${' '.repeat(indentLevel+4)}<tr>\n`;

	for (let i=0; i < tableData.headerCells.length; i++) {
		const alignment = tableData.cellsAlignment[i]
		const cell = tableData.headerCells[i];
		text += `${' '.repeat(indentLevel+6)}<th${alignment ? ' align='+alignment: ""}>${parseInlineNodes(cell, linkRefs, dangerousHtmlTags)}</th>\n`
	}
	text += `${' '.repeat(indentLevel+4)}</tr>\n`;
	text += `${' '.repeat(indentLevel+2)}</thead>\n`

	text += `${' '.repeat(indentLevel+2)}<tbody>\n`
	for (let row of tableData.bodyCells) {
		text += `${' '.repeat(indentLevel+4)}<tr>\n`
		let generatedCellsLen = row.length < tableData.headerCells.length ? row.length : tableData.headerCells.length // number of cells in a row can't exceed that of the header row
		for (let i=0; i<generatedCellsLen; i++) {
			const alignment = tableData.cellsAlignment[i]
			text += `${' '.repeat(indentLevel+6)}<td${alignment ? ' align='+alignment: ""}>${parseInlineNodes(row[i], linkRefs, dangerousHtmlTags)}</td>\n`
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
function constructTableFrom(text: string, indentLevel: number, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]) {
	const tableData:TableData = {headerCells: [], bodyCells: [], cellsAlignment: []}
	let tableRows = text.split(/(?:\r\n)|\n|\r/);

	function cellsAreDelimiters(cells: string[]) {
		return cells.every(cell => (/^\s*:?-+:?\s*$/).test(cell))
	}

	if (tableRows[0] == text)
		return "";
	for (let i=0; i<tableRows.length; i++) {
		const cells = getRowContent(tableRows[i])
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
		}else {
			tableData.bodyCells.push(cells);
		}
	}
	return generateTableHtml(tableData, indentLevel, linkRefs, dangerousHtmlTags);
}

export function formsValidCharRef(text: string, index: number) { // Still need to do decimal and hexadecimal references
	let ref = ""

	for (let i=index+1; i<text.length; i++) {
		if ((/\s|&/).test(text[i])){ // html entities don't contain ampersands or whitespace
			return false;
		}else if (text[i] === ';') {
			break;
		}else if (i === text.length-1) {
			ref = "";
			break;
		}
		ref += text[i];
	}
	if ((/^#\d{1,7}$/).test(ref) || (/^(?:x|X)[a-fA-F0-9]{1,6}$/).test(ref) || validEntityRefs['&'+ref.toLowerCase()+';']) {
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
			output += "&amp;" // possibly warn that such cahracter doesn't exist incase they were trying to use that
			continue;
		}
		output += textStream[i];
	}
	return output
}

// parse the content of leaf blocks for inline nodes and unescaped html tags
function parseContent(node: HtmlNode, indentLevel:number, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]) {
	if (node.nodeName === "paragraph" || (/h[1-6]/).test(node.nodeName)) {
		node.textContent = parseInlineNodes(node.textContent as string, linkRefs, dangerousHtmlTags);
		node.textContent = node.textContent.trimLeft();
	}else if (node.nodeName === "table") {
		node.textContent = constructTableFrom(node.textContent, indentLevel, linkRefs, dangerousHtmlTags)
	}else if (["indented code block", "fenced code backtick", "fenced code tilde"].includes(node.nodeName)) {
		node.textContent = escapeSpecialCharacters(node.textContent)
	}

	if (!["indented code block", "fenced code backtick", "fenced code tilde"].includes(node.nodeName) && node.textContent) {
		node.textContent = removeInvalidCharRef(node.textContent);
	}
}

// Returns a boolean indicating if a node's grandparent is a loose list
// node parameter expected is a leaf block type
function listAncestorIsLoose(node: HtmlNode){
	let listNodeAncestor = node.parentNode.parentNode;
	if (listNodeAncestor && listNodeAncestor.tight === "false") {
		return true;
	}
	return false;
}

// Generates the html representation of a node
function generateNodeHtml(node: HtmlNode, indentLevel: number) {
	if (node.nodeName === "html block") {
		return `${node.textContent}\n`
	}else if (node.nodeName === "paragraph") {
		if (node.infoString === "loose") {
			return node.textContent ? `<p>${node.textContent}</p>\n` : "";
		}else {
			return node.textContent;
		}
	}else if (node.nodeName === "table") {
		return node.textContent;
	}else if ((/h[1-6]/).test(node.nodeName)) {
		const tag = node.nodeName;
		return `<${tag}>${node.textContent}</${tag}>\n` // html header
	}else if (node.nodeName.startsWith("fenced code") || node.nodeName === "indented code block") {
		return `<pre><code${node.infoString ? (" class=\"language-"+node.infoString+'"') : ''}>${node.textContent + '\n'}</code></pre>\n`
	}
}

// Generates the formatted html representation of a node
function generateNodeHtmlPretty(node: HtmlNode, indentLevel: number) {
	const whiteSpace = ' '.repeat(indentLevel); // indentation for node's generated html

	if (node.nodeName === "html block") {
		return `${whiteSpace}${node.textContent}\n`
	}else if (node.nodeName === "paragraph") {
		if (node.parentNode.nodeName !== "li" || listAncestorIsLoose(node))
			return node.textContent ? `${whiteSpace}<p>${node.textContent}</p>\n` : "";
		return node.textContent ? `${whiteSpace}${node.textContent}\n` : ""; // Paragraph nodes inside tight lists should be rendered without tags
	}else if (node.nodeName === "table") {
		return node.textContent;
	}else if ((/h[1-6]/).test(node.nodeName)) {
		const tag = node.nodeName;
		return `${whiteSpace}<${tag}>${node.textContent}</${tag}>\n` // html header
	}else if (node.nodeName.startsWith("fenced code") || node.nodeName === "indented code block") {
		return (
			`${whiteSpace}<pre>\n${whiteSpace+'  '}`+
			`<code${node.infoString ? (" class="+node.infoString+'"') : ''}">${node.textContent}\n${whiteSpace+'  '}</code>\n${whiteSpace}</pre>\n`
		)
	}
}


/** Generates html text from a tree containing markdown blocks as nodes
 * @param {rootNode} : The root node of the tree 
 * @param {indentLevel} : The number of spaces to be used for indentation when generating content
 * @param {linkRefs} : key-value mappings of link label and link label reference definitions 
 * @param {dangerousHtmlTags} : array of strings containing tag names that would be considered dangerous html */
export function generateHtmlFromTreePretty(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]):string {
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
		parseContent(rootNode, indentLevel, linkRefs, dangerousHtmlTags)
		text = generateNodeHtml(rootNode, indentLevel);
		console.log(text)
	}

	if (rootNode.textContent === undefined && rootNode.nodeName !== "root") {
		text += `${whiteSpace}</${rootNode.nodeName}>\n`; // Generate the closing tag for the node
	}
	
	return text;
}




/** Generates html text from a tree containing markdown blocks as nodes
 * @param {rootNode} : The root node of the tree 
 * @param {indentLevel} : The number of spaces to be used for indentation when generating content
 * @param {linkRefs} : key-value mappings of link label and link label reference definitions 
 * @param {dangerousHtmlTags} : array of strings containing tag names that would be considered dangerous html */
export function generateHtmlFromTree1(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]):string {
	let text = "";

	// Generate the opening tag for the node
	if (rootNode.nodeName === "hr") {
		return `<${rootNode.nodeName}/>\n`
	}else if (rootNode.nodeName === "ol") {
		text = `<${rootNode.nodeName} start="${rootNode.startNo}">\n`	
	}else if (rootNode.textContent === undefined) {
		text = `<${rootNode.nodeName}>\n`;
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
		parseContent(rootNode, indentLevel, linkRefs, dangerousHtmlTags)
		text = generateNodeHtml(rootNode, indentLevel);
	}

	if (rootNode.textContent === undefined && rootNode.nodeName !== "root") {
		text += `</${rootNode.nodeName}>\n`; // Generate the closing tag for the node
	}
	
	return text;
}


/** Generates html text from a tree containing markdown blocks as nodes
 * @param {rootNode} : The root node of the tree 
 * @param {indentLevel} : The number of spaces to be used for indentation when generating content
 * @param {linkRefs} : key-value mappings of link label and link label reference definitions 
 * @param {dangerousHtmlTags} : array of strings containing tag names that would be considered dangerous html */
export default function generateHtmlFromTree(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]):string {
	let text = "";

	// Generate the opening tag for the node
	if (rootNode.nodeName === "hr") {
		return `<${rootNode.nodeName} />\n`
	}else if (rootNode.nodeName === "ol") {
		text = `<${rootNode.nodeName} start="${rootNode.startNo}">\n`	
	}else if (rootNode.textContent === undefined) {
		text = `<${rootNode.nodeName}>\n`;
	}

	if (rootNode.textContent === undefined) { // rootNode is a container block
		if (rootNode.nodeName === "root") // the root node of the tree
			text = ""; // Html shouldn't be generated for the tree's root node because it represents the document being parsed
		else 
			indentLevel += 2; // A node's children should be indented 2 spaces more than the parent

		for (let i=0; i<rootNode.children.length; i++) {
			const childNode = rootNode.children[i];

			if (childNode.nodeName === "paragraph") {
				if (childNode.parentNode.nodeName !== "li" || listAncestorIsLoose(childNode)) {
					childNode.infoString = "loose"
				}else {
					text = text.slice(0, text.length-1)
				}
			}
			text += generateHtmlFromTree(childNode, indentLevel, linkRefs, dangerousHtmlTags);
			if (rootNode.children.length > 1 && childNode.nodeName === "paragraph" && childNode.infoString != "loose") {
				text += '\n'
			}
		}

	}else { // rootNode is a leaf block
		parseContent(rootNode, indentLevel, linkRefs, dangerousHtmlTags)
		text = generateNodeHtml(rootNode, indentLevel);
	}

	if (rootNode.textContent === undefined && rootNode.nodeName !== "root") {
		text += `</${rootNode.nodeName}>\n`; // Generate the closing tag for the node
	}
	
	return text;
}

