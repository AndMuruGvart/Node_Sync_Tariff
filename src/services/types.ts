export type NormalizedTariffRow = {
    tariffKey: string;
    warehouseName: string | null;
    warehouseId: number | null;
    boxTypeName: string | null;
    boxTypeId: number | null;
    coefficient: number | null;
    deliveryBase: number | null;
    deliveryLiter: number | null;
    storageBase: number | null;
    storageLiter: number | null;
    rawPayload: Record<string, unknown>;
};

export type TariffSheetRow = {
    tariffDate: string;
    warehouseName: string | null;
    warehouseId: number | null;
    boxTypeName: string | null;
    boxTypeId: number | null;
    coefficient: number | null;
    deliveryBase: number | null;
    deliveryLiter: number | null;
    storageBase: number | null;
    storageLiter: number | null;
    updatedAt: Date;
};