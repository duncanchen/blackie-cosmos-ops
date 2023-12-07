import { Container } from "@azure/cosmos";
import { QueryBuilder } from "./query-builder";

export type HydrateFn<T> = (
    executionNumber: number,
    lastInstance?: T,
) => Promise<Array<T>>;


const Hose = <T>(fn: HydrateFn<T>) => {
    return async function* () {
        let current = 0;
        let lastInstance: T | undefined = undefined;
        let collection: Array<T> = [];
        const rehyDrate = async () => {
            collection = await fn(current, lastInstance);
            if (collection.length > 0) {
                lastInstance = collection[collection.length - 1];
            }
            current++;
        };
        while (true) {
            if (collection.length === 0) {
                await rehyDrate();
            }
            if (collection.length === 0) {
                break;
            }
            yield collection.shift();
        }
    };
};



export const pagingWithinPartition = (container: Container, partition: string, batchSize = 100) => {
    const hydrate = async (count: number, instance: any) => {
        const { id = "" } = instance || {}
        const reader = await new QueryBuilder()
            .container(container)
            .partition(partition)
            .greater("id", id)
            .orderBy("id", "ASC")
            .takeN(0, batchSize)
            .run()
        return reader?.all()
    }
    return Hose(hydrate)
}