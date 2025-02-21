import { useEffect, useState, useRef} from 'react';
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Feature } from 'ol';
import { Polygon } from 'ol/geom';
import { Style, Stroke, Fill } from 'ol/style';
import { transform } from 'ol/proj';
import { cellToBoundary, polygonToCells } from 'h3-js';
import type { Map,  MapBrowserEvent} from 'ol';
import type View from 'ol/View';
import Overlay from 'ol/Overlay'

interface HexagonGridProps {
  map: Map | null;
}

// Функция сопоставляющая масштаб карты и уровень гексов
const zoomToResolution = (zoom: number): number => {
  const Resolution = Math.min(Math.max(5, Math.floor(zoom*0.8) - 3), 10);
  return Resolution;
};


const HexagonGrid: React.FC<HexagonGridProps> = ({ map }) => {

  // Цвета для стилей гексов
  const HexColor = 'rgba(51, 153, 204, 0.1)';
  const BorderHexColor = 'rgba(51, 153, 204, 1)';
  const ActHexColor = 'rgba(204, 51, 51, 0.1)';
  const ActBorderHexColor = 'rgba(204, 51, 51, 1)';

  // Начальный стиль гексов
  const [vectorLayer] = useState(
    new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        stroke: new Stroke({
          color: BorderHexColor,
          width: 2,
        }),
        fill: new Fill({
          color: HexColor,
        }),
      }),
    })
  );

  // Актуальный уровень гексов
  const [currentResolution, setCurrentResolution] = useState(10);
  
  // Добавляем ссылки для попапа
  const popupRef = useRef<HTMLDivElement>(document.createElement('div'));
  const popupOverlay = useRef<Overlay>();
  
  useEffect(() => {
    if (!map) return;

    // Инициализация попапа
    popupOverlay.current = new Overlay({
      element: popupRef.current,
      positioning: 'bottom-center',
      offset: [0, -15],
      autoPan: false
    });
    
    // Стили для попапа
    popupRef.current.style.background = 'white';
    popupRef.current.style.padding = '100px';
    popupRef.current.style.border = '10px solid #333';
    popupRef.current.style.borderRadius = '100px';
    popupRef.current.style.boxShadow = '0 20px 40px rgba(0,0,0,0.2)';
    
    // Добавляем попап
    map.addOverlay(popupOverlay.current);

    // Добавляем слой
    map.addLayer(vectorLayer);

    // Обновление сетки
    const updateGrid = () => {

      const view = map.getView() as View; if (!view){return}
      
      // Получаем зону видимости карты
      const extent = view.calculateExtent(map.getSize());
      const polygonCoords = [
        transform([extent[0], extent[1]], 'EPSG:3857', 'EPSG:4326'),
        transform([extent[0], extent[3]], 'EPSG:3857', 'EPSG:4326'),
        transform([extent[2], extent[3]], 'EPSG:3857', 'EPSG:4326'),
        transform([extent[2], extent[1]], 'EPSG:3857', 'EPSG:4326'),
      ];
      polygonCoords.push(polygonCoords[0]); // Замыкаем полигон
      
      // Получаем масштаб карты
      const zoom = view.getZoom(); if (!zoom){return}

      // Задаем уровень гексов
      const newResolution = zoomToResolution(zoom);
      setCurrentResolution(newResolution);
      
      // Определяем отображаемые гексы гексов
      const hexagons = polygonToCells(polygonCoords, currentResolution, true);
      
      // Получаем начинку слоя
      const source = vectorLayer.getSource()!;
      source.clear();

      // Формируем гексы
      hexagons.forEach((h3Index) => {

        // Получаем вершины гекса
        const coords = cellToBoundary(h3Index, true);

        // Преобразуем в плоскость
        const polygon = coords.map((coord) =>
          transform([coord[0], coord[1]], 'EPSG:4326', 'EPSG:3857')
        );
        polygon.push(polygon[0]); // Замыкаем полигон

        // Создаем фигуру
        const hexagon = new Feature({
          geometry: new Polygon([polygon]),
          h3Index: h3Index,
        });

        // Добавляем в состав слоя
        source.addFeature(hexagon);
      });
    };

    // Обновление при первой инициализации
    updateGrid();

    const clickHandler = (event: MapBrowserEvent<UIEvent>) => {

      // Сбрасываем попап при каждом клике
      popupOverlay.current?.setPosition(undefined);

      // Получает гекс, по которому клик
      const feature = map.forEachFeatureAtPixel(event.pixel, (f) => f) as Feature;
      if (!feature) {return}

      // Меняем состояние гекса
      const isSelected = !feature.get('selected');
      feature.set('selected', isSelected);
      
      // Если стал активен
      if (isSelected){
        // Показываем попап
        const h3Index = feature.get('h3Index');
        const geometry = feature.getGeometry() as Polygon;
        const center = geometry.getInteriorPoint().getCoordinates();
        popupRef.current.innerHTML = h3Index; // Задаем текст
        popupOverlay.current?.setPosition(center);
      }

      // Выводим индекс гекса
      console.log('h3Index:', feature.get('h3Index'));
     
      // Задаем новый стиль гекса
      const newStyle = new Style({
        stroke: new Stroke({
          color: isSelected ? ActBorderHexColor : BorderHexColor,
          width: 2,
        }),
        fill: new Fill({
          color: isSelected ? ActHexColor : HexColor,
        }),
      });
      feature.setStyle(newStyle);
    };

    // Инициализация событий
    map.on('moveend', updateGrid);
    map.on('click', clickHandler);

    // Отчистка при выходе
    return () => {
      popupOverlay.current && map.removeOverlay(popupOverlay.current);
      map.un('moveend', updateGrid);
      map.un('click', clickHandler);
      map.removeLayer(vectorLayer);
    };
  }, [map, currentResolution]);

  return null;
};

export default HexagonGrid;