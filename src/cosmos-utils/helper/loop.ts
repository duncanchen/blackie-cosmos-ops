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


const HoseBatch = <T>(fn: HydrateFn<T>) => {
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
            await rehyDrate();
            if (collection.length === 0) {
                break;
            }
            yield [...collection]
        }
    };
};



// stepping will spit one item at a time 
export const steppingWithinPartition = (container: Container, partition: string, batchSize = 100) => {
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

// paging will return a batch of items, each batch will be an array of items
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
    return HoseBatch(hydrate)
}

