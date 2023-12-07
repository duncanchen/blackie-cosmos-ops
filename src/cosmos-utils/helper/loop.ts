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