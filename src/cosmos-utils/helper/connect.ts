import { DefaultAzureCredential } from "@azure/identity";

// Get Cosmos Client
import { CosmosClient } from "@azure/cosmos";

type Config = {
    endpoint: string
    databaseName: string
    containerName: string
}
export const connect = (config: Config) => {
    const { endpoint, databaseName, containerName } = config
    const cosmosClient = new CosmosClient({
        endpoint,
        aadCredentials: new DefaultAzureCredential()
    });
    const database = cosmosClient.database(databaseName);
    const container = database.container(containerName);
    return {
        database,
        container,
    }
}
// Authenticate to Azure Cosmos DB

