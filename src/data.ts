import {
    type FieldDataInput,
    framer,
    type ManagedCollection,
    type ManagedCollectionFieldInput,
    type ManagedCollectionItemInput,
    type ProtectedMethod,
} from "framer-plugin"

export const PLUGIN_KEYS = {
    DATA_SOURCE_ID: "dataSourceId",
    SLUG_FIELD_ID: "slugFieldId",
} as const

export interface DataSource {
    id: string
    fields: readonly ManagedCollectionFieldInput[]
    items: FieldDataInput[]
}


export async function getDataSource(dataSourceId: string, abortSignal?: AbortSignal): Promise<DataSource> {
    // Call your remote API instead of local JSON
    const response = await fetch("https://brain-stg.rotobot.ai/v1/articles", {
                        signal: abortSignal,    
                        headers: {
                        Accept: "application/json",
                        Authorization: "Bearer eyJhbGciOiJIUzI1NiIsImtpZCI6Imtsa0FxdE4zQmNTRlNsMzMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FyZG9ueWpqdHdsamZ6c3poY2tvLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIxZjE5YzQ5OS0xYzFhLTQ5MWEtYjM5NC1iYWI5MDMxNDgyOWUiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU0NTY0MTUwLCJpYXQiOjE3NTQ1MzkxNTAsImVtYWlsIjoiIiwicGhvbmUiOiI5MjMwNjQ0OTAzNDMiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJwaG9uZSIsInByb3ZpZGVycyI6WyJwaG9uZSJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiMWYxOWM0OTktMWMxYS00OTFhLWIzOTQtYmFiOTAzMTQ4MjllIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoib3RwIiwidGltZXN0YW1wIjoxNzUyNzY5NzE3fV0sInNlc3Npb25faWQiOiJlY2RjZjc2ZC0yYmFiLTQ1YzYtOWRmNC1jNjIxMmFmNTE4ZTEiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.2dMAsn-WVPk-dyjE3e5Aw9ZPSUaIoRg_sACzVYZvMmc", // if needed
                        },
                    });
    const apiData = await response.json()
    if (!response.ok) {
        throw new Error(`Failed to fetch data source: ${response.statusText}`)
    }

    console.info("API Data:", apiData)

    // Define supported fields manually (based on the API structure)
    const fields: ManagedCollectionFieldInput[] = [
        { id: "article_id", name: "article_id", type: "string" },
        { id: "title", name: "Title", type: "string" },
        { id: "date", name: "Date", type: "date" },
        { id: "image", name: "Image", type: "image" },
        { id: "content", name: "Content", type: "formattedText" },
    ]

    // Map API response into Framer's expected item format
    const items: FieldDataInput[] = apiData.map((article: any) => ({
        article_id: { type: "string", value: article.article_id },        
        title: { type: "string", value: article.title },
        date: { type: "date", value: article.date_created },
        image: { type: "image", value: article.header_image_url },
        content: { type: "formattedText", value: article.full_text },
    }))

    return {
        id: dataSourceId,
        fields,
        items,
    }
}


export function mergeFieldsWithExistingFields(
    sourceFields: readonly ManagedCollectionFieldInput[],
    existingFields: readonly ManagedCollectionFieldInput[]
): ManagedCollectionFieldInput[] {
    return sourceFields.map(sourceField => {
        const existingField = existingFields.find(existingField => existingField.id === sourceField.id)
        if (existingField) {
            return { ...sourceField, name: existingField.name }
        }
        return sourceField
    })
}

export async function syncCollection(
    collection: ManagedCollection,
    dataSource: DataSource,
    fields: readonly ManagedCollectionFieldInput[],
    slugField: ManagedCollectionFieldInput
) {
    const items: ManagedCollectionItemInput[] = []
    const unsyncedItems = new Set(await collection.getItemIds())

    for (let i = 0; i < dataSource.items.length; i++) {
        const item = dataSource.items[i]
        if (!item) throw new Error("Logic error")

        const slugValue = item[slugField.id]
        if (!slugValue || typeof slugValue.value !== "string") {
            console.warn(`Skipping item at index ${i} because it doesn't have a valid slug`)
            continue
        }

        unsyncedItems.delete(slugValue.value)

        const fieldData: FieldDataInput = {}
        for (const [fieldName, value] of Object.entries(item)) {
            const field = fields.find(field => field.id === fieldName)

            // Field is in the data but skipped based on selected fields.
            if (!field) continue

            // For details on expected field value, see:
            // https://www.framer.com/developers/plugins/cms#collections
            fieldData[field.id] = value
        }

        items.push({
            id: slugValue.value,
            slug: slugValue.value,
            draft: false,
            fieldData,
        })
    }

    await collection.removeItems(Array.from(unsyncedItems))
    await collection.addItems(items)

    await collection.setPluginData(PLUGIN_KEYS.DATA_SOURCE_ID, dataSource.id)
    await collection.setPluginData(PLUGIN_KEYS.SLUG_FIELD_ID, slugField.id)
}

export const syncMethods = [
    "ManagedCollection.removeItems",
    "ManagedCollection.addItems",
    "ManagedCollection.setPluginData",
] as const satisfies ProtectedMethod[]

export async function syncExistingCollection(
    collection: ManagedCollection,
    previousDataSourceId: string | null,
    previousSlugFieldId: string | null
): Promise<{ didSync: boolean }> {
    if (!previousDataSourceId) {
        return { didSync: false }
    }

    if (framer.mode !== "syncManagedCollection" || !previousSlugFieldId) {
        return { didSync: false }
    }

    if (!framer.isAllowedTo(...syncMethods)) {
        return { didSync: false }
    }

    try {
        const dataSource = await getDataSource(previousDataSourceId)
        const existingFields = await collection.getFields()

        const slugField = dataSource.fields.find(field => field.id === previousSlugFieldId)
        if (!slugField) {
            framer.notify(`No field matches the slug field id “${previousSlugFieldId}”. Sync will not be performed.`, {
                variant: "error",
            })
            return { didSync: false }
        }

        await syncCollection(collection, dataSource, existingFields, slugField)
        return { didSync: true }
    } catch (error) {
        console.error(error)
        framer.notify(`Failed to sync collection “${previousDataSourceId}”. Check browser console for more details.`, {
            variant: "error",
        })
        return { didSync: false }
    }
}
