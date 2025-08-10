import { framer } from "framer-plugin"
import { useEffect, useState } from "react"
import { getDataSource, type DataSource } from "./data"

interface SelectDataSourceProps {
    onSelectDataSource: (dataSource: DataSource) => void
}

export function SelectDataSource({ onSelectDataSource }: SelectDataSourceProps) {
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            try {
                const dataSource = await getDataSource("articles")
                onSelectDataSource(dataSource)
            } catch (error) {
                console.error(error)
                framer.notify("Failed to load data source 'articles'.", {
                    variant: "error",
                })
            } finally {
                setIsLoading(false)
            }
        }

        load()
    }, [onSelectDataSource])

    return (
        <main className="loading">
            <div className="framer-spinner" />
            <p>Loading articles data…</p>
        </main>
    )
}
