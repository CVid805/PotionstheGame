import { Coord, floor, step } from './coord';
import { TerrainType } from './terrainType';

export class PathFinder {
  worldWidth!: number;
  worldHeight!: number;
  walkable: boolean[][];
  blockingItems: Record<string, string> = {};

  // Constructor
  constructor(tiles: number[][], terrain_types: TerrainType[]) {
    this.worldWidth = tiles.length;
    this.worldHeight = tiles[0].length;
    //console.log('world size', this.worldWidth, this.worldHeight);

    //this.generateWalkable(mapData);

    const terrainTypes = new Map();
    for (const td of terrain_types) {
      terrainTypes.set(td.id, td);
    }
    terrainTypes.set(-1, {
      name: 'Space',
      id: -1,
      spritesheet_offset: 0,
      walkable: false
    });

    const walkable: boolean[][] = [];
    for (let x = 0; x < this.worldWidth; x++) {
      walkable[x] = [];
      for (let y = 0; y < this.worldHeight; y++) {
        const tile = tiles[x][y];
        walkable[x][y] = terrainTypes.get(tile)!.walkable;
      }
    }

    this.walkable = walkable;
    this.worldWidth = walkable.length;
    this.worldHeight = walkable[0].length;
  }

  spawnCoord(): Coord {
    let x: number;
    let y: number;

    do {
      x = Math.floor(Math.random() * this.worldWidth);
      y = Math.floor(Math.random() * this.worldHeight);
    } while (!this.isWalkable([], x, y));

    return { x, y };
  }

  clearBlockingItems() {
    this.blockingItems = {};
  }

  setBlockingItem(x: number, y: number, value: string) {
    this.blockingItems[`${x},${y}`] = value;
  }

  isWalkable(unlocks: string[], x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.worldWidth || y >= this.worldHeight) {
      return false;
    }
    if (!this.walkable[x][y]) {
      return false;
    }
    const blockingItem = this.blockingItems[`${x},${y}`];
    const walkable = !(blockingItem && !unlocks.includes(blockingItem));

    //console.log(`Blocking item ${x}, ${y} (${walkable})`, blockingItem, 'Unlocks:', unlocks);
    return walkable;
  }

  private heuristic(a: Coord, b: Coord): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  private aStar(
    unlocks: string[],
    start: Coord,
    goal: Coord,
    fuzzy: boolean
  ): Coord[] | null {
    const rows = this.worldWidth;
    const cols = this.worldHeight;
    const openSet: [number, Coord][] = [];
    const cameFrom: Map<string, Coord> = new Map();
    const gScore: Map<string, number> = new Map();
    const fScore: Map<string, number> = new Map();

    const startKey = `${start.x},${start.y}`;
    gScore.set(startKey, 0);
    fScore.set(startKey, this.heuristic(start, goal));
    openSet.push([0, start]);
    let steps = 0;

    while (openSet.length > 0) {
      steps += 1;
      if (steps > 1000) {
        console.log(
          'Too many steps at step:',
          steps,
          'Current:',
          openSet[0][1]
        );
        return null;
      }

      openSet.sort((a, b) => a[0] - b[0]);
      const current = openSet.shift()![1];
      const currentKey = `${current.x},${current.y}`;

      if (current.x === goal.x && current.y === goal.y) {
        return this.reconstructPath(cameFrom, current);
      }

      // Stop if we're two tiles away from the goal when fuzzy is true
      if (fuzzy && this.heuristic(current, goal) <= 2) {
        return this.reconstructPath(cameFrom, current);
      }

      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1]
      ]) {
        const neighbor: Coord = step(current, dx, dy);
        const neighborKey = `${neighbor.x},${neighbor.y}`;

        if (
          neighbor.x >= 0 &&
          neighbor.x < rows &&
          neighbor.y >= 0 &&
          neighbor.y < cols
        ) {
          if (this.isWalkable(unlocks, neighbor.x, neighbor.y)) {
            if (dx !== 0 && dy !== 0) {
              if (
                !this.isWalkable(unlocks, current.x + dx, current.y) ||
                !this.isWalkable(unlocks, current.x, current.y + dy)
              ) {
                continue;
              }
            }

            const tentativeGScore = (gScore.get(currentKey) ?? Infinity) + 1;
            if (tentativeGScore < (gScore.get(neighborKey) ?? Infinity)) {
              cameFrom.set(neighborKey, current);
              gScore.set(neighborKey, tentativeGScore);
              fScore.set(
                neighborKey,
                tentativeGScore + this.heuristic(neighbor, goal)
              );
              openSet.push([fScore.get(neighborKey)!, neighbor]);
            }
          }
        }
      }
    }

    return null; // No path found
  }

  private reconstructPath(
    cameFrom: Map<string, Coord>,
    current: Coord
  ): Coord[] {
    const path: Coord[] = [current];
    let currentKey = `${current.x},${current.y}`;

    while (cameFrom.has(currentKey)) {
      current = cameFrom.get(currentKey)!;
      currentKey = `${current.x},${current.y}`;
      path.push(current);
    }

    path.reverse();
    return path;
  }

  private isStraightLine(p1: Coord, p2: Coord, p3: Coord): boolean {
    return (p2.y - p1.y) * (p3.x - p2.x) === (p3.y - p2.y) * (p2.x - p1.x);
  }

  private simplifyPath(path: Coord[]): Coord[] {
    if (path.length <= 2) {
      return path;
    }

    const simplifiedPath: Coord[] = [path[0]];

    for (let i = 1; i < path.length - 1; i++) {
      if (!this.isStraightLine(path[i - 1], path[i], path[i + 1])) {
        simplifiedPath.push(path[i]);
      }
    }

    simplifiedPath.push(path[path.length - 1]);
    return simplifiedPath;
  }

  generatePath(
    unlocks: string[],
    start: Coord,
    end: Coord,
    fuzzy: boolean = false
  ): Coord[] {
    end = floor(end);
    start = floor(start);

    if (!fuzzy && !this.isWalkable(unlocks, end.x, end.y)) {
      // new Error(`End position (${JSON.stringify(end)}) is not walkable`);
      return [];
    }

    const path = this.aStar(unlocks, start, end, fuzzy);
    if (!path) {
      return [];
    }

    const simplifiedPath = this.simplifyPath(path);
    if (simplifiedPath.length > 0) {
      simplifiedPath.shift(); // Remove the first point since it's the current position
    }
    //console.log(`Path from ${JSON.stringify(start)} to ${JSON.stringify(end)} is ${JSON.stringify(simplifiedPath)} steps, full ${JSON.stringify(path)}`);
    return simplifiedPath;
  }
}