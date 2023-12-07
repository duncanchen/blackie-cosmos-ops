import type { Container, JSONValue, SqlQuerySpec } from "@azure/cosmos"
import { Extractor } from "./extractor"
import { parallel } from "radash"

class StringBuilder {
    lines: string[] = []

    constructor(init = "") {
        if (init) this.lines.push(init)
    }

    push(s: string) {
        this.lines.push(s)
    }

    toString(joinWith = "\n") {
        return this.lines.join(joinWith)
    }
}

export const insertAtoB = (extra: string[], original: string[]) =>
    original.concat(extra.filter((id) => !original.includes(id)))

type SqlParameter = {
    /** Name of the parameter. (i.e. "@lastName") */
    name: string
    /** Value of the parameter (this is safe to come from users, assuming they are authorized) */
    value: any
}

const dotTo_ = (s: string) => {
    const parts = s.split(".")
    return parts.join("_")
}

type sortingOrder = "ASC" | "DESC"
type sortOption = {
    field: string
    order: sortingOrder
}

const composeHas = (
    path: string,
    tokens: string[],
    hasOp: "hasAll" | "hasAny"
) => {
    const hasQuery = new StringBuilder()
    const parameters: SqlParameter[] = []
    tokens.forEach((token, idx) => {
        const name = dotTo_(path)
        const paramName = `@${name}${hasOp}_${idx}`
        parameters.push({
            name: paramName,
            value: token,
        })
        hasQuery.push(` ARRAY_CONTAINS(c.${path}, ${paramName})`)
    })
    const finalHas = hasQuery.lines.join(
        hasOp.endsWith("All") ? " AND " : " OR "
    )
    return { query: ` (${finalHas}) `, parameters }
}

export class QueryBuilder {
    parameters: SqlParameter[] = []
    offset = -1
    limit = -1
    private withOffset = false
    private sortOptions: sortOption[] = []
    private _container: Container | undefined
    private _partition = "entity"

    constructor(public query: string = `select * from c where 1=1`) {
        if (!this.query.trim().endsWith("where 1=1")) {
            this.query += " where 1=1 "
        }
    }


    container(container: Container) {
        this._container = container
        return this
    }

    partition(partition: string) {
        this.query = this.query + ` and c.${this._partition} = @partition `
        this.addParameter(`@partition`, partition)
        return this
    }

    addSourceOrg(sourceOrg: string) {
        this.query = this.query + ` and ARRAY_CONTAINS(c.scopes, @sourceOrg)`
        this.addParameter("@sourceOrg", sourceOrg)
        return this
    }

    has(path: string, value: string) {
        const parts = path.split(".")
        const fullName = parts.join("_")
        this.query = this.query + ` and ARRAY_CONTAINS(c.${path}, @${fullName})`
        this.addParameter(`@${fullName}`, value)
        return this
    }

    hasAll(path: string, values: string[]) {
        const c = composeHas(path, values, "hasAll")
        this.query = this.query + " AND " + c.query
        this.parameters = this.parameters.concat(c.parameters)
        return this
    }

    partOf(path: string, value: any[]) {
        const fullName = dotTo_(path)
        this.query = this.query + ` and ARRAY_CONTAINS(@${fullName}, c.${path})`
        this.addParameter(`@${fullName}`, value)
        return this
    }

    addEqual(path: string, value: any) {
        const paramName = `@${dotTo_(path)}`
        this.query = this.query + ` and c.${path} = ${paramName}`
        this.addParameter(paramName, value)
        return this
    }

    nameOrAliasMatches(value: string) {
        const path = "nameOrAlias"
        const paramName = `@${path}`
        this.query =
            this.query +
            ` and ( c.name = ${paramName} or array_contains(c.aliases, ${paramName}) ) `
        this.addParameter(paramName, value.toLowerCase())
        return this
    }

    startsWith(path: string, value: string) {
        const paramName = `@${dotTo_(path)}`
        this.query = this.query + ` and startsWith(c.${path}, ${paramName})`
        this.addParameter(paramName, value)
        return this
    }

    greater(path: string, value: any) {
        const paramName = `@${dotTo_(path)}_g`
        this.query = this.query + ` and c.${path} > ${paramName}`
        this.addParameter(paramName, value)
        return this
    }

    less(path: string, value: any) {
        const paramName = `@${dotTo_(path)}_l`
        this.query = this.query + ` and c.${path} < ${paramName}`
        this.addParameter(paramName, value)
        return this
    }

    greaterEqual(path: string, value: any) {
        const paramName = `@${dotTo_(path)}_gt`
        this.query = this.query + ` and c.${path} >= ${paramName}`
        this.addParameter(paramName, value)
        return this
    }

    lessEqual(path: string, value: any) {
        const paramName = `@${dotTo_(path)}_lt`
        this.query = this.query + ` and c.${path} <= ${paramName}`
        this.addParameter(paramName, value)
        return this
    }

    topN(n: number) {
        return this.takeN(0, n)
    }

    takeN(offset: number, n: number) {
        this.withOffset = true
        this.offset = offset
        this.limit = n
        return this
    }

    orderBy(path: string, order: sortingOrder = "ASC") {
        this.sortOptions.push({ field: path, order })
        return this
    }

    toSpec(): SqlQuerySpec {
        const spec = {
            query: this.query,
            parameters: this.parameters,
        }

        // add order
        spec.query += this.getOrderClause()

        // append limit and offset
        if (this.withOffset) {
            const extra = `offset ${this.offset} limit ${this.limit}`
            spec.query += " " + extra
        }
        console.log(spec)
        return spec
    }

    async run(container?: Container) {
        this._container = container ?? this._container
        return await this.internalRun()
    }

    async execute() {
        return await this.internalRun()
    }

    private async internalRun() {
        const result = await this._container!.items
            .query(this.toSpec())
            .fetchAll()
        return Promise.resolve(new Extractor(result))
    }

    async delete(container: Container, timeToLive = 30) {
        const docsExt = await this.run(container)
        const docs = docsExt.all()
        if (docs) {
            const nextDocs = docs.map((d) => {
                const ttl = Math.floor(Math.random() * timeToLive) + 10
                return { ...d, ttl, deleted: true }
            })
            // just noticed node will complain too many listeners for the concurrent process
            // const saver = new ThrottleSaving(container)
            // const rt = await saver.withCurrency(10).save(nextDocs)
            // return Promise.resolve(nextDocs)
            const tasks = await parallel(5, nextDocs, async (doc: any) => {
                return await container.items.upsert(doc)
            })
            // let tasks = nextDocs.map((d) => container.items.upsert(d))
            // await Promise.all(tasks)
            return Promise.resolve(nextDocs)
        }
        return Promise.resolve(docs)
    }

    private getOrderClause() {
        if (this.sortOptions.length === 0) return ""
        const instruction = this.sortOptions
            .map((c) => `c.${c.field} ${c.order}`)
            .join(", ")
        return " order by " + instruction
    }

    private addParameter(name: string, value: JSONValue) {
        if (name.startsWith("@")) {
            this.parameters.push({ name, value })
        } else {
            this.parameters.push({ name: `@${name}`, value })
        }
        return this
    }

    public async readOne(container?: Container) {
        const reader = await this.run(container)
        return reader.one()
    }

    public async readAll(container?: Container) {
        const reader = await this.run(container)
        return reader.all()
    }
}


export const Q = (container: Container) => {
    return {
        from: (partition: string) => {
            function getBuilder() {
                const bdr = new QueryBuilder()
                    .container(container)
                    .partition(partition)
                return bdr
            }
            
            return {
                id: async <T>(id: string) => {
                    return await container.item(id, partition).read() as T
                },
                nextN: async (n: number, since: string) => {
                    const reader = await getBuilder().greater("id", since)
                        .orderBy("id", "ASC")
                        .takeN(0, n).run()
                    return reader?.all()
                },
                select: (...fields: string[]) => {
                    console.log(fields)
                },
                selectAll: () => { }
            }
        },
        upsert: {

        },
        expire: {

        }
    }
}


